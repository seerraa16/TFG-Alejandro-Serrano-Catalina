"""Cliente Open-Meteo para obtener precipitación de una fecha + lugar.

Migrado desde `inferencia_app.ipynb` (celdas 25 y 29). Encapsula:

    - elección automática entre forecast (≤16 días) y archivo (histórico)
    - parseo de la respuesta hourly y selección de la hora más cercana
    - traducción de `precip_mm` a `lluvia_ord` (0-3) según los umbrales del proyecto
    - manejo de errores con fallback opcional a "sin lluvia"

NO integra con el predictor — es un módulo independiente cuya única
responsabilidad es contestar "¿llueve a esta hora en este lugar?".
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import TypedDict

import pandas as pd
import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

# Tipo aceptado para fechas: timestamp pandas, datetime estándar o string ISO.
DateInput = pd.Timestamp | datetime | str


# ---------------------------------------------------------------------------
# Tipos de retorno
# ---------------------------------------------------------------------------
class WeatherInfo(TypedDict):
    """Estructura devuelta por el cliente.

    Campos pedidos en el contrato del módulo: `precip_mm`, `llueve`,
    `lluvia_ord`. Los demás son extra (vienen "gratis" en la misma llamada).
    """

    precip_mm: float          # precipitación horaria (mm)
    llueve: int               # 1 si precip_mm > 0, 0 si no
    lluvia_ord: int           # 0=ninguna, 1=leve, 2=moderada, 3=intensa
    temperatura: float        # ºC
    prob_lluvia: float        # 0-100 %
    fuente: str               # "open-meteo:archive" | "open-meteo:forecast" | "fallback"


# ---------------------------------------------------------------------------
# Excepción específica
# ---------------------------------------------------------------------------
class WeatherFetchError(RuntimeError):
    """Error al consultar Open-Meteo (red, HTTP, JSON malformado, etc.)."""


# ---------------------------------------------------------------------------
# Categorización precip_mm → lluvia_ord
# ---------------------------------------------------------------------------
def precip_to_lluvia_ord(precip_mm: float) -> int:
    """Traduce precipitación horaria a la escala ordinal del proyecto.

        0  = sin lluvia          (< 0.001 mm/h)
        1  = lluvia leve         (< 2.5 mm/h)
        2  = lluvia moderada     (< 7.5 mm/h)
        3  = lluvia intensa      (>= 7.5 mm/h)

    Estos umbrales replican exactamente los del notebook para mantener
    coincidencia con el preprocesamiento del dataset (`lluvia_ord` en parquet).
    """
    if precip_mm < 1e-3:
        return 0
    if precip_mm < 2.5:
        return 1
    if precip_mm < 7.5:
        return 2
    return 3


# ---------------------------------------------------------------------------
# Cliente
# ---------------------------------------------------------------------------
class OpenMeteoClient:
    """Cliente síncrono para Open-Meteo (forecast + archive).

    El endpoint se elige automáticamente según la fecha:
      - Fecha en el pasado (antes de hoy) → archive-api (datos consolidados)
      - Hoy o futuro                       → forecast (predicción)

    Se devuelve siempre el mismo `WeatherInfo` con `fuente` indicando cuál
    se ha usado. El cliente es síncrono (usa `requests`); para integrarlo
    en endpoints async basta con envolverlo en `asyncio.to_thread(...)`.
    """

    def __init__(
        self,
        lat: float = settings.WEATHER_DEFAULT_LAT,
        lon: float = settings.WEATHER_DEFAULT_LON,
        timezone: str = settings.WEATHER_DEFAULT_TIMEZONE,
        timeout_s: float = settings.WEATHER_DEFAULT_TIMEOUT_S,
        forecast_url: str = settings.WEATHER_FORECAST_URL,
        archive_url: str = settings.WEATHER_ARCHIVE_URL,
    ) -> None:
        self.lat = lat
        self.lon = lon
        self.timezone = timezone
        self.timeout_s = timeout_s
        self.forecast_url = forecast_url
        self.archive_url = archive_url

    # -- API pública -------------------------------------------------------
    def get(self, dt: DateInput) -> WeatherInfo:
        """Devuelve la meteo para la hora indicada.

        Args:
            dt: timestamp objetivo. Acepta `pd.Timestamp`, `datetime` o
                string parseable (ISO8601 recomendado).

        Returns:
            `WeatherInfo` con `precip_mm`, `llueve`, `lluvia_ord`,
            `temperatura`, `prob_lluvia`, `fuente`.

        Raises:
            WeatherFetchError: si la petición HTTP falla, el cuerpo no es
                JSON válido o la respuesta no contiene los campos esperados.
        """
        ts = self._normalize_dt(dt)
        endpoint, fuente = self._pick_endpoint(ts)
        params = self._build_params(ts)

        logger.info(
            "Consultando Open-Meteo (%s) para %s @ (%s, %s) ...",
            fuente,
            ts.strftime("%Y-%m-%d %H:%M"),
            self.lat,
            self.lon,
        )

        try:
            response = requests.get(endpoint, params=params, timeout=self.timeout_s)
            response.raise_for_status()
        except requests.Timeout as e:
            raise WeatherFetchError(
                f"Timeout ({self.timeout_s}s) consultando Open-Meteo"
            ) from e
        except requests.RequestException as e:
            raise WeatherFetchError(f"Error de red consultando Open-Meteo: {e}") from e

        try:
            payload = response.json()
            hourly = payload["hourly"]
        except (ValueError, KeyError) as e:
            raise WeatherFetchError(
                f"Respuesta inesperada de Open-Meteo: {e}"
            ) from e

        return self._parse_hourly(hourly, ts, fuente)

    def get_safe(self, dt: DateInput) -> WeatherInfo:
        """Variante de `get` que nunca lanza: si falla, devuelve fallback "sin lluvia".

        Equivalente al `weather_client_get_or_default` del notebook. Útil en
        endpoints donde un fallo meteorológico no debe romper la petición.
        """
        try:
            return self.get(dt)
        except WeatherFetchError as e:
            logger.warning("Open-Meteo falló (%s) — fallback a 'sin lluvia'.", e)
            return {
                "precip_mm": 0.0,
                "llueve": 0,
                "lluvia_ord": 0,
                "temperatura": 0.0,
                "prob_lluvia": 0.0,
                "fuente": "fallback",
            }

    # -- Helpers internos --------------------------------------------------
    @staticmethod
    def _normalize_dt(dt: DateInput) -> pd.Timestamp:
        ts = pd.Timestamp(dt)
        if ts is pd.NaT:
            raise WeatherFetchError(f"Fecha inválida: {dt!r}")
        return ts

    def _pick_endpoint(self, ts: pd.Timestamp) -> tuple[str, str]:
        """Devuelve (url, etiqueta_fuente) según la fecha sea histórica o no."""
        today = pd.Timestamp(datetime.now().date())
        if ts.normalize() < today:
            return self.archive_url, "open-meteo:archive"
        return self.forecast_url, "open-meteo:forecast"

    def _build_params(self, ts: pd.Timestamp) -> dict[str, str | float]:
        return {
            "latitude": self.lat,
            "longitude": self.lon,
            "hourly": "precipitation,rain,precipitation_probability,temperature_2m",
            "start_date": ts.strftime("%Y-%m-%d"),
            "end_date": ts.strftime("%Y-%m-%d"),
            "timezone": self.timezone,
        }

    @staticmethod
    def _parse_hourly(hourly: dict, ts: pd.Timestamp, fuente: str) -> WeatherInfo:
        """Selecciona la hora más cercana a `ts` y construye el WeatherInfo."""
        target = ts.strftime("%Y-%m-%dT%H:00")
        try:
            i = hourly["time"].index(target)
        except (ValueError, KeyError):
            i = 0  # fallback defensivo: primera hora del día
            logger.warning(
                "Hora %s no encontrada en respuesta hourly; usando índice 0.",
                target,
            )

        precip_mm = float(hourly["precipitation"][i] or 0.0)
        return {
            "precip_mm": precip_mm,
            "llueve": 1 if precip_mm > 0 else 0,
            "lluvia_ord": precip_to_lluvia_ord(precip_mm),
            "temperatura": float(hourly["temperature_2m"][i] or 0.0),
            "prob_lluvia": float(hourly["precipitation_probability"][i] or 0.0),
            "fuente": fuente,
        }

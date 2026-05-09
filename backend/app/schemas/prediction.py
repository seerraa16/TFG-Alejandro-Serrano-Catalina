"""Esquemas Pydantic del endpoint de predicción."""

from __future__ import annotations

from datetime import datetime as DateTime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------
class PredictRequest(BaseModel):
    """Cuerpo del POST /predict."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "origin": "Calle Valderrodrigo 31",
                    "destination": "NTT Data",
                    "datetime": "2026-05-12T09:00:00",
                    "mode": "osm",
                }
            ]
        }
    )

    origin: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Dirección o lugar de salida (texto libre).",
    )
    destination: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Dirección o lugar de llegada.",
    )
    datetime: DateTime = Field(
        ...,
        description="Instante objetivo del trayecto (ISO 8601).",
    )
    mode: Literal["osm", "sensors"] = Field(
        "osm",
        description="`osm` = red vial real (recomendado). `sensors` = grafo de sensores.",
    )
    weather_override: dict[str, Any] | None = Field(
        None,
        description=(
            "Si se pasa, salta la llamada a Open-Meteo y usa estos valores. "
            "Esperado: `precip_mm` y `lluvia_ord` (0-3)."
        ),
    )
    accidente: bool = Field(
        False,
        description="Marca todos los sensores como afectados por incidente reciente.",
    )


# ---------------------------------------------------------------------------
# Response (componentes)
# ---------------------------------------------------------------------------
class RouteSummaryOut(BaseModel):
    origin: str
    destination: str
    mode: Literal["osm", "sensors"]
    n_sensors_total: int = Field(description="Sensores que componen la ruta.")
    n_sensors_predicted: int = Field(description="Sensores con predicción válida.")
    n_sensors_skipped: int = Field(description="Sensores sin perfil histórico.")
    distance_total_m: float
    distance_total_km: float


class SensorPredictionOut(BaseModel):
    sensor_id: int
    intensidad: float = Field(description="Vehículos / 15 min predichos.")
    ocupacion: float = Field(description="Ocupación física del carril (%).")
    carga: float = Field(description="Saturación tráfico/capacidad (%).")
    lat: float | None = Field(None, description="Latitud del sensor.")
    lon: float | None = Field(None, description="Longitud del sensor.")


class WeatherOut(BaseModel):
    precip_mm: float
    llueve: int = Field(description="1 si hay precipitación, 0 si no.")
    lluvia_ord: int = Field(description="0=ninguna, 1=leve, 2=moderada, 3=intensa.")
    temperatura: float
    prob_lluvia: float
    fuente: str = Field(description="`open-meteo:forecast`, `:archive`, `override` o `fallback`.")


# ---------------------------------------------------------------------------
# Response (raíz)
# ---------------------------------------------------------------------------
class PredictResponse(BaseModel):
    """Respuesta de POST /predict."""

    eta_minutes: float = Field(description="ETA en minutos.")
    eta_seconds: float = Field(description="ETA en segundos.")
    avg_speed_kmh: float | None = Field(description="Velocidad media efectiva (km/h).")
    distance_total_m: float

    route_summary: RouteSummaryOut
    sensor_predictions: list[SensorPredictionOut]
    weather: WeatherOut

    geometry: list[list[float]] = Field(
        default_factory=list,
        description="Polilínea de la ruta: lista de [lat, lon].",
    )

    elapsed_ms: int = Field(description="Tiempo de ejecución en el servidor (ms).")
    requested_datetime: DateTime = Field(description="Echo del datetime recibido.")


# ---------------------------------------------------------------------------
# Error
# ---------------------------------------------------------------------------
class ErrorResponse(BaseModel):
    """Forma estándar de los errores devueltos por la API."""

    detail: str

"""Pipeline principal de inferencia: routing + weather + LSTM + ETA.

Una sola función pública (`predict_eta`) que recibe origen, destino y
fecha-hora, y devuelve la estimación completa de tiempo de llegada
junto con los datos intermedios de la ruta y las predicciones por sensor.

Compone los módulos ya migrados:
    - app.routing       → ruta + sensores + distancias
    - app.weather       → lluvia (precip_mm, lluvia_ord) en la fecha
    - app.prediction    → predicción LSTM por sensor (este paquete)
    - app.eta           → vmed por sensor + ETA total

NO genera mapas, NO devuelve HTML. Sólo datos estructurados.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Literal, TypedDict

import pandas as pd

from app.eta import compute_eta
from app.routing import RouteMode, route_by_address
from app.routing.graph_loader import get_sensors_df, get_tipo_elem_int
from app.weather import OpenMeteoClient, WeatherInfo

from app.prediction.traffic_inference import predict_for_sensors

logger = logging.getLogger(__name__)

DateInput = pd.Timestamp | datetime | str


# ---------------------------------------------------------------------------
# Errores y tipos de retorno
# ---------------------------------------------------------------------------
class PredictionError(RuntimeError):
    """Error en alguna fase del pipeline (routing, predicción, ETA)."""


class RouteSummary(TypedDict):
    origen: str
    destino: str
    mode: Literal["osm", "sensors"]
    n_sensores_ruta: int
    n_sensores_predichos: int
    n_sensores_skipped: int
    distancia_total_m: float


class InferenceResult(TypedDict):
    """Resultado completo del pipeline. Lo que devuelve `predict_eta`."""

    eta: dict[str, Any]                         # output de compute_eta
    velocidad_media_kmh: float | None           # velocidad efectiva calculada por ETA
    tiempo_total_s: float                       # duración estimada
    tiempo_total_min: float
    distancia_total_m: float
    sensor_ids: list[int]                       # sensores en orden de paso
    distancias_m: list[float]                   # tramos entre sensores (len = n-1)
    sensores_skipped: list[int]                 # sensores sin perfil histórico
    predictions: dict[int, dict[str, float]]    # sensor_id → {intensidad, ocupacion, carga}
    weather: WeatherInfo                        # meteo aplicada (real o override)
    route_summary: RouteSummary                 # resumen one-shot de la ruta
    info: dict[str, Any]                        # metadatos: mode, datetime, accidente, etc.
    geometry: list[tuple[float, float]]         # polilínea de la ruta como lista de (lat, lon)


# ---------------------------------------------------------------------------
# Cliente meteorológico singleton (reutilizado entre llamadas)
# ---------------------------------------------------------------------------
_weather_client: OpenMeteoClient | None = None


def _get_weather_client() -> OpenMeteoClient:
    global _weather_client
    if _weather_client is None:
        _weather_client = OpenMeteoClient()
    return _weather_client


# ---------------------------------------------------------------------------
# Pipeline principal
# ---------------------------------------------------------------------------
def predict_eta(
    origen: str,
    destino: str,
    dt: DateInput,
    *,
    mode: RouteMode = "osm",
    weather_override: dict | None = None,
    accidente: bool = False,
) -> InferenceResult:
    """Calcula ETA completo entre dos puntos para una fecha-hora dada.

    Pipeline (4 etapas):

        1. Routing — ruta + lista de sensores atravesados + distancias.
        2. Weather — precipitación prevista (forecast u archivo).
        3. Predicción LSTM — intensidad/ocupación/carga por sensor.
        4. ETA — vmed por sensor (BPR) y tiempo total.

    Args:
        origen: dirección o lugar de salida (texto libre).
        destino: dirección o lugar de llegada.
        dt: instante objetivo del trayecto. Acepta `pd.Timestamp`,
            `datetime` o string ISO8601.
        mode: `"osm"` (red vial real, recomendado) o `"sensors"`
            (Dijkstra sobre el grafo de sensores).
        weather_override: dict con `precip_mm` y `lluvia_ord` para saltar
            la llamada a Open-Meteo (útil para escenarios "qué pasaría si").
        accidente: si True, marca a todos los sensores con incidente
            reciente — el modelo lo recibe en las features.

    Returns:
        `InferenceResult` con ETA, velocidades, predicciones por sensor y
        metadatos. Lista entera de campos en el TypedDict.

    Raises:
        PredictionError: si no se encuentra ruta, si no hay ningún sensor
            que se pueda predecir o si falla la inferencia LSTM.
        ValueError: parámetros inválidos (mode desconocido, fecha mal formada).
    """
    ts = pd.Timestamp(dt)
    info: dict[str, Any] = {
        "datetime": ts.isoformat(),
        "mode": mode,
        "accidente": accidente,
    }
    logger.info("predict_eta: %r → %r @ %s (mode=%s)", origen, destino, ts, mode)

    # 1) Routing -----------------------------------------------------------
    route = route_by_address(origen, destino, mode=mode)
    if route is None:
        raise PredictionError(
            f"No se encontró ruta {origen!r} → {destino!r} en modo {mode!r}"
        )
    sensor_ids: list[int] = list(route["sensor_ids"])
    distancias_m: list[float] = list(route["distancias_m"])
    if len(sensor_ids) < 2:
        raise PredictionError(
            f"Ruta con < 2 sensores ({len(sensor_ids)}), no se puede calcular ETA"
        )

    raw = route["raw"]
    if mode == "osm":
        geometry: list[tuple[float, float]] = list(raw.get("geometry", []))
    else:
        sensors_df = get_sensors_df()
        coords_map = dict(zip(sensors_df["id"], zip(sensors_df["latitud"], sensors_df["longitud"])))
        geometry = [coords_map[sid] for sid in sensor_ids if sid in coords_map]

    # 2) Weather -----------------------------------------------------------
    if weather_override is not None:
        weather: WeatherInfo = {
            "precip_mm": float(weather_override.get("precip_mm", 0.0)),
            "llueve": int(weather_override.get("llueve", 0)),
            "lluvia_ord": int(weather_override.get("lluvia_ord", 0)),
            "temperatura": float(weather_override.get("temperatura", 0.0)),
            "prob_lluvia": float(weather_override.get("prob_lluvia", 0.0)),
            "fuente": "override",
        }
        info["weather_source"] = "override"
    else:
        weather = _get_weather_client().get_safe(ts)
        info["weather_source"] = weather["fuente"]

    # 3) Predicción LSTM ---------------------------------------------------
    predictions_df, skipped = predict_for_sensors(
        sensor_ids, ts, dict(weather), accidente=accidente
    )
    if predictions_df.empty:
        raise PredictionError(
            "Ningún sensor de la ruta tenía perfil histórico — sin predicciones."
        )

    # 4) ETA --------------------------------------------------------------
    tipo_elem_int = get_tipo_elem_int()
    eta = compute_eta(sensor_ids, distancias_m, predictions_df, tipo_elem_int)
    if "error" in eta:
        raise PredictionError(f"compute_eta devolvió error: {eta['error']}")

    # 5) Construcción de la respuesta -------------------------------------
    predictions_dict: dict[int, dict[str, float]] = {
        int(sid): {
            "intensidad": float(row["intensidad"]),
            "ocupacion": float(row["ocupacion"]),
            "carga": float(row["carga"]),
        }
        for sid, row in predictions_df.iterrows()
    }

    summary: RouteSummary = {
        "origen": origen,
        "destino": destino,
        "mode": mode,
        "n_sensores_ruta": len(sensor_ids),
        "n_sensores_predichos": len(predictions_dict),
        "n_sensores_skipped": len(skipped),
        "distancia_total_m": float(route["distancia_total_m"]),
    }

    return {
        "eta": eta,
        "velocidad_media_kmh": eta.get("velocidad_media_efectiva_kmh"),
        "tiempo_total_s": float(eta["tiempo_total_s"]),
        "tiempo_total_min": float(eta["tiempo_total_min"]),
        "distancia_total_m": float(eta["distancia_total_m"]),
        "sensor_ids": sensor_ids,
        "distancias_m": distancias_m,
        "sensores_skipped": skipped,
        "predictions": predictions_dict,
        "weather": weather,
        "route_summary": summary,
        "info": info,
        "geometry": geometry,
    }

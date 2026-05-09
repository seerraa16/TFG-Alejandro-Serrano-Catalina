"""Endpoint POST /predict — pipeline completo de predicción de ETA.

Pega el orquestador `predict_eta` (routing + weather + LSTM + ETA) detrás
de un router FastAPI. Maneja errores conocidos (sin ruta, sin sensores
predecibles, fechas inválidas) traduciéndolos al código HTTP apropiado.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.prediction import PredictionError, predict_eta
from app.schemas.prediction import (
    ErrorResponse,
    PredictRequest,
    PredictResponse,
    RouteSummaryOut,
    SensorPredictionOut,
    WeatherOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["prediction"])


@router.post(
    "/predict",
    response_model=PredictResponse,
    summary="Predicción de tráfico + ETA entre dos direcciones",
    responses={
        400: {"model": ErrorResponse, "description": "Parámetros inválidos."},
        422: {
            "model": ErrorResponse,
            "description": "No se pudo procesar (sin ruta, sin sensores predecibles, ...).",
        },
        500: {"model": ErrorResponse, "description": "Error interno del servidor."},
    },
)
def post_predict(req: PredictRequest) -> PredictResponse:
    """Calcula tiempo estimado de llegada entre dos direcciones para una fecha-hora.

    Ejecuta el pipeline completo:
        1. Geocoding + routing (OSM o grafo de sensores)
        2. Consulta meteorológica (Open-Meteo, forecast o histórico)
        3. Predicción LSTM por sensor
        4. Cálculo de ETA con BPR + corrección por ocupación
    """
    t0 = time.perf_counter()
    logger.info(
        "POST /predict origen=%r destino=%r dt=%s mode=%s accidente=%s",
        req.origin,
        req.destination,
        req.datetime.isoformat(),
        req.mode,
        req.accidente,
    )

    try:
        result: dict[str, Any] = predict_eta(
            origen=req.origin,
            destino=req.destination,
            dt=req.datetime,
            mode=req.mode,
            weather_override=req.weather_override,
            accidente=req.accidente,
        )
    except PredictionError as e:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.warning("POST /predict falló tras %d ms: %s", elapsed_ms, e)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from e
    except ValueError as e:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.warning("POST /predict bad input tras %d ms: %s", elapsed_ms, e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except Exception:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.exception("POST /predict crash tras %d ms", elapsed_ms)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno durante la predicción.",
        )

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    rs = result["route_summary"]
    logger.info(
        "POST /predict OK %d ms — %d sensores (%d predichos / %d skipped) "
        "ETA=%.1f min vmed=%s km/h",
        elapsed_ms,
        rs["n_sensores_ruta"],
        rs["n_sensores_predichos"],
        rs["n_sensores_skipped"],
        result["tiempo_total_min"],
        result["velocidad_media_kmh"],
    )

    return PredictResponse(
        eta_minutes=result["tiempo_total_min"],
        eta_seconds=result["tiempo_total_s"],
        avg_speed_kmh=result["velocidad_media_kmh"],
        distance_total_m=result["distancia_total_m"],
        route_summary=RouteSummaryOut(
            origin=rs["origen"],
            destination=rs["destino"],
            mode=rs["mode"],
            n_sensors_total=rs["n_sensores_ruta"],
            n_sensors_predicted=rs["n_sensores_predichos"],
            n_sensors_skipped=rs["n_sensores_skipped"],
            distance_total_m=rs["distancia_total_m"],
            distance_total_km=round(rs["distancia_total_m"] / 1000, 3),
        ),
        sensor_predictions=[
            SensorPredictionOut(
                sensor_id=sid,
                intensidad=p["intensidad"],
                ocupacion=p["ocupacion"],
                carga=p["carga"],
            )
            for sid, p in result["predictions"].items()
        ],
        weather=WeatherOut(**result["weather"]),
        elapsed_ms=elapsed_ms,
        requested_datetime=req.datetime,
    )

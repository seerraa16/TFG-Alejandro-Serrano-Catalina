"""Endpoint POST /predict — pipeline completo de predicción de ETA."""

from __future__ import annotations

import logging
import time
from typing import Any, Literal

import folium
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import HTMLResponse

from app.prediction import PredictionError, predict_eta
from app.routing.graph_loader import get_sensors_df
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


# ---------------------------------------------------------------------------
# Generación del mapa Folium
# ---------------------------------------------------------------------------
def _sensor_color(carga: float) -> str:
    threshold = 1.0 if carga <= 1.0 else 100.0
    pct = carga if threshold == 100.0 else carga * 100
    if pct < 33:
        return "green"
    if pct < 66:
        return "orange"
    return "red"


def _build_route_map(result: dict[str, Any]) -> str:
    geometry = result.get("geometry", [])
    if not geometry:
        return "<html><body><p>Sin geometría disponible.</p></body></html>"

    center = geometry[len(geometry) // 2]
    m = folium.Map(location=center, zoom_start=13, tiles="CartoDB positron")

    folium.PolyLine(geometry, color="#2563eb", weight=5, opacity=0.85,
                    tooltip="Ruta estimada").add_to(m)

    folium.Marker(
        geometry[0],
        popup=folium.Popup(f"<b>Origen</b><br>{result['route_summary']['origen']}", max_width=200),
        icon=folium.Icon(color="green", icon="circle", prefix="fa"),
    ).add_to(m)
    folium.Marker(
        geometry[-1],
        popup=folium.Popup(f"<b>Destino</b><br>{result['route_summary']['destino']}", max_width=200),
        icon=folium.Icon(color="red", icon="flag", prefix="fa"),
    ).add_to(m)

    sensors_df = get_sensors_df()
    coords_map = dict(zip(sensors_df["id"], zip(sensors_df["latitud"], sensors_df["longitud"])))
    predictions = result.get("predictions", {})

    for sid in result.get("sensor_ids", []):
        coords = coords_map.get(sid)
        if coords is None:
            continue
        pred = predictions.get(sid, {})
        carga = pred.get("carga", 0.0)
        color = _sensor_color(carga) if pred else "gray"
        popup_html = (
            f"<b>Sensor {sid}</b><br>"
            f"Intensidad: {pred.get('intensidad', '–'):.0f} veh/15min<br>"
            f"Ocupación: {pred.get('ocupacion', '–'):.1f}%<br>"
            f"Carga: {carga:.1f}"
            if pred else f"<b>Sensor {sid}</b><br>Sin predicción"
        )
        folium.CircleMarker(
            location=coords,
            radius=7,
            color=color,
            fill=True,
            fill_color=color,
            fill_opacity=0.85,
            popup=folium.Popup(popup_html, max_width=180),
        ).add_to(m)

    rs = result["route_summary"]
    eta_min = result["tiempo_total_min"]
    vmed = result.get("velocidad_media_kmh") or 0.0
    dist_km = rs["distancia_total_m"] / 1000
    weather = result.get("weather", {})
    lluvia_labels = ["Sin lluvia", "Lluvia leve", "Lluvia moderada", "Lluvia intensa"]
    lluvia_txt = lluvia_labels[int(weather.get("lluvia_ord", 0))]

    legend = f"""
    <div style="position:fixed;top:12px;right:12px;z-index:9999;
                background:white;padding:14px 18px;border-radius:10px;
                box-shadow:0 2px 10px rgba(0,0,0,.25);font-family:sans-serif;
                min-width:210px;font-size:13px;line-height:1.6">
      <b style="font-size:14px">Ruta estimada</b><br>
      ⏱️ <b>{eta_min:.1f} min</b> ({eta_min/60:.2f} h)<br>
      📏 {dist_km:.2f} km<br>
      🚗 {vmed:.1f} km/h media<br>
      🌧️ {lluvia_txt} ({weather.get('precip_mm', 0):.1f} mm)<br>
      🌡️ {weather.get('temperatura', '–')} °C
      <hr style="margin:6px 0;border:none;border-top:1px solid #e2e8f0">
      <span style="color:#64748b;font-size:11px">
        {rs['n_sensores_predichos']} sensores predichos<br>
        Modo: {rs['mode']}
      </span>
      <hr style="margin:6px 0;border:none;border-top:1px solid #e2e8f0">
      <span style="font-size:11px">
        🟢 &lt;33% &nbsp; 🟠 33-66% &nbsp; 🔴 &gt;66% carga
      </span>
    </div>
    """
    m.get_root().html.add_child(folium.Element(legend))

    return m._repr_html_()


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
            use_osm_speed_limits=req.use_osm_speed_limits,  # [OSM-SPEED]
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

    sensors_df = get_sensors_df()
    coords_map = dict(zip(sensors_df["id"], zip(sensors_df["latitud"], sensors_df["longitud"])))

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
                lat=coords_map.get(sid, (None, None))[0],
                lon=coords_map.get(sid, (None, None))[1],
            )
            for sid, p in result["predictions"].items()
        ],
        weather=WeatherOut(**result["weather"]),
        geometry=[[pt[0], pt[1]] for pt in result.get("geometry", [])],
        elapsed_ms=elapsed_ms,
        requested_datetime=req.datetime,
    )


# ---------------------------------------------------------------------------
# GET /map — mapa interactivo con la ruta (abre directamente en el navegador)
# ---------------------------------------------------------------------------
@router.get(
    "/map",
    response_class=HTMLResponse,
    summary="Mapa interactivo con la ruta y predicción de tráfico",
    tags=["map"],
)
def get_map(
    origin: str = Query(..., description="Dirección de salida"),
    destination: str = Query(..., description="Dirección de llegada"),
    dt: str = Query(..., description="Fecha-hora ISO 8601, p.ej. 2026-05-12T09:00:00"),
    mode: Literal["osm", "sensors"] = Query("osm"),
    accidente: bool = Query(False),
) -> HTMLResponse:
    """Devuelve un mapa HTML interactivo con la ruta calculada.

    Abre directamente en el navegador:
    ``http://localhost:8000/map?origin=Calle+Valderrodrigo+31&destination=NTT+Data&dt=2026-05-12T09:00:00``
    """
    try:
        result = predict_eta(
            origen=origin,
            destino=destination,
            dt=dt,
            mode=mode,
            accidente=accidente,
        )
    except PredictionError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception:
        logger.exception("GET /map error")
        raise HTTPException(status_code=500, detail="Error interno durante la predicción.")

    html = _build_route_map(result)
    return HTMLResponse(content=html)

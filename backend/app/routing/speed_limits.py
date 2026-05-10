"""Límites de velocidad reales por sensor extraídos del grafo OSM.

# ============================================================
# FEATURE: Velocidades máximas OSM (use_osm_speed_limits)
# ============================================================
# Para ELIMINAR esta funcionalidad en el futuro:
#   1. Borrar este archivo
#   2. En predictor.py: quitar el import y las líneas marcadas con # [OSM-SPEED]
#   3. En eta_calculator.py: quitar el parámetro v_libre_per_sensor
#   4. En sensors_routing.py: quitar el parámetro use_time_weight y _time_w
#   5. En router.py: quitar el parámetro use_time_weight
#   6. En schemas/prediction.py: quitar el campo use_osm_speed_limits
#   7. En api/v1/prediction.py: quitar la línea marcada con # [OSM-SPEED]
#   8. Frontend: quitar useOsmSpeedLimits de SettingsContext, Settings,
#      traffic.js y Planner
# ============================================================
"""

from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

_sensor_maxspeeds: dict[int, float] | None = None


def get_sensor_maxspeeds() -> dict[int, float]:
    """Devuelve mapping sensor_id → velocidad máxima (km/h). Carga lazy."""
    global _sensor_maxspeeds
    if _sensor_maxspeeds is None:
        _sensor_maxspeeds = _compute_sensor_maxspeeds()
    return _sensor_maxspeeds


def _compute_sensor_maxspeeds() -> dict[int, float]:
    """Extrae maxspeed del grafo OSM para cada sensor.

    Para cada sensor busca su osm_node en el grafo OSM y promedia los
    maxspeed de las aristas salientes. Si no hay dato OSM, usa el valor
    por defecto según tipo_elem (M30=100, URB=50).
    """
    try:
        from app.routing.graph_loader import get_osm_graph, get_sensors_df
        sensors_df = get_sensors_df()
        G_osm = get_osm_graph()
    except Exception:
        logger.warning(
            "No se pudo cargar el grafo OSM para maxspeeds; fallback a tipo_elem."
        )
        return _fallback_from_tipo_elem()

    maxspeeds: dict[int, float] = {}
    n_osm = 0

    for _, row in sensors_df.iterrows():
        sid = int(row["id"])
        osm_node = int(row.get("osm_node", -1))
        default_v = (
            settings.BPR_V_LIBRE_M30
            if str(row.get("tipo_elem", "URB")) == "M30"
            else settings.BPR_V_LIBRE_URB
        )

        if osm_node == -1 or osm_node not in G_osm:
            maxspeeds[sid] = default_v
            continue

        speeds = []
        for _, _, data in G_osm.out_edges(osm_node, data=True):
            parsed = _parse_maxspeed(data.get("maxspeed"))
            if parsed is not None:
                speeds.append(parsed)

        if speeds:
            maxspeeds[sid] = round(sum(speeds) / len(speeds), 1)
            n_osm += 1
        else:
            maxspeeds[sid] = default_v

    logger.info(
        "Maxspeeds OSM: %d sensores con dato real, %d con fallback tipo_elem",
        n_osm,
        len(maxspeeds) - n_osm,
    )
    return maxspeeds


def _fallback_from_tipo_elem() -> dict[int, float]:
    """Fallback: usa v_libre según tipo_elem cuando no hay grafo OSM."""
    from app.routing.graph_loader import get_sensors_df
    sensors_df = get_sensors_df()
    return {
        int(row["id"]): (
            settings.BPR_V_LIBRE_M30
            if str(row.get("tipo_elem", "URB")) == "M30"
            else settings.BPR_V_LIBRE_URB
        )
        for _, row in sensors_df.iterrows()
    }


def _parse_maxspeed(value) -> float | None:
    """Convierte el atributo maxspeed de OSM a km/h float.

    OSM puede devolver: "50", "50 km/h", "30 mph", ["50", "70"],
    "ES:urban", None, "signals", etc.
    """
    if value is None:
        return None

    if isinstance(value, list):
        parsed = [_parse_maxspeed(v) for v in value]
        valid = [v for v in parsed if v is not None]
        return round(sum(valid) / len(valid), 1) if valid else None

    if isinstance(value, (int, float)):
        return float(value)

    s = str(value).strip().lower()
    if s in ("", "none", "signals", "variable"):
        return None

    s = s.replace("km/h", "").strip()

    if "mph" in s:
        try:
            return round(float(s.replace("mph", "").strip()) * 1.60934, 1)
        except ValueError:
            return None

    _ZONE_DEFAULTS: dict[str, float] = {
        "es:urban": 50.0,
        "es:rural": 90.0,
        "es:motorway": 120.0,
        "es:living_street": 20.0,
        "urban": 50.0,
        "rural": 90.0,
        "motorway": 120.0,
        "living_street": 20.0,
        "walk": 10.0,
    }
    if s in _ZONE_DEFAULTS:
        return _ZONE_DEFAULTS[s]
    if ":" in s:
        zone = s.split(":")[-1].strip()
        if zone in _ZONE_DEFAULTS:
            return _ZONE_DEFAULTS[zone]

    try:
        return float(s)
    except ValueError:
        return None
"""Entry points públicos del módulo de routing.

Tres formas de pedir una ruta, en orden creciente de comodidad para el
cliente:

    - `route_by_coords_osm(lat_o, lon_o, lat_d, lon_d)`
        Routing por la red vial OSM, sigue la geometría real de las calles.

    - `route_by_coords(lat_o, lon_o, lat_d, lon_d)`
        Routing por el grafo de sensores, devuelve la secuencia de sensores
        que el vehículo atravesará.

    - `route_by_address(origen, destino, mode="osm" | "sensors")`
        Misma información pero aceptando direcciones en texto libre
        (las geocodifica antes de llamar al modo elegido). Devuelve un
        formato unificado con `sensor_ids` y `distancias_m` listos para
        alimentar al módulo de ETA.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from app.routing.geocoding import geocode_place
from app.routing.osm_routing import osm_cum_distances, route_by_coords_osm
from app.routing.sensors_routing import route_by_coords

logger = logging.getLogger(__name__)

RouteMode = Literal["osm", "sensors"]


def route_by_address(
    origen: str,
    destino: str,
    mode: RouteMode = "osm",
    use_time_weight: bool = False,  # [OSM-SPEED] solo aplica cuando mode="sensors"
) -> dict[str, Any] | None:
    """Calcula una ruta a partir de dos direcciones en texto libre.

    Geocodifica origen y destino, llama al routing del modo indicado y
    normaliza la salida a un formato común que sirve directamente como
    entrada del módulo de predicción y de ETA.

    Args:
        origen: dirección o lugar de partida.
        destino: dirección o lugar de llegada.
        mode: `"osm"` para seguir la red vial real (recomendado),
            `"sensors"` para Dijkstra sobre el grafo de sensores.

    Returns:
        Dict con:
            - `origen`, `destino`: `{texto, query, coord}` con el input,
              la query efectiva enviada a Nominatim y las coordenadas.
            - `mode`: el modo usado ("osm" | "sensors").
            - `sensor_ids`: lista ordenada de sensor_id atravesados.
            - `distancias_m`: distancias en metros entre sensores
              consecutivos. `len == len(sensor_ids) - 1`.
            - `distancia_total_m`: distancia total recorrida.
            - `raw`: el dict completo devuelto por el routing subyacente,
              por si hace falta acceder a la geometría OSM o a metadata
              adicional.

        `None` si no se encuentra ruta para el modo indicado.

    Raises:
        ValueError: si `mode` no es válido o si la geocodificación falla.
    """
    if mode not in ("osm", "sensors"):
        raise ValueError("mode debe ser 'osm' o 'sensors'")

    lat_o, lon_o, q_o = geocode_place(origen)
    lat_d, lon_d, q_d = geocode_place(destino)

    if mode == "osm":
        res = route_by_coords_osm(lat_o, lon_o, lat_d, lon_d)
        if res is None:
            return None
        sens = res["sensores_en_ruta"]
        cum = osm_cum_distances(res["ruta_osm"])
        sens_cum = [cum[int(p)] for p in sens["pos_ruta"]]
        ids = sens["id"].tolist()
        dists = [round(sens_cum[i + 1] - sens_cum[i], 1) for i in range(len(ids) - 1)]
    else:
        res = route_by_coords(lat_o, lon_o, lat_d, lon_d, use_time_weight=use_time_weight)  # [OSM-SPEED]
        if res is None:
            return None
        ids = list(res["ruta"])
        dists = [t["dist_m"] for t in res["tramos"]]

    return {
        "origen": {"texto": origen, "query": q_o, "coord": (lat_o, lon_o)},
        "destino": {"texto": destino, "query": q_d, "coord": (lat_d, lon_d)},
        "mode": mode,
        "sensor_ids": ids,
        "distancias_m": dists,
        "distancia_total_m": float(res["distancia_total"]),
        "raw": res,
    }


__all__ = [
    "route_by_coords_osm",
    "route_by_coords",
    "route_by_address",
    "RouteMode",
]

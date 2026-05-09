"""Routing sobre la red vial OSM real (Dijkstra con OSM nodes).

A diferencia del routing por sensores, aquí la ruta sigue la geometría
exacta de las calles. Después se identifican los sensores que cae sobre
la ruta (mediante la columna `osm_node` de cada sensor).
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

import networkx as nx

from app.routing.graph_loader import get_osm_graph, get_sensors_df

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Distancias acumuladas a lo largo de una ruta OSM
# ---------------------------------------------------------------------------
def osm_cum_distances(ruta_osm: Iterable[int]) -> list[float]:
    """Distancia acumulada en metros para cada nodo de una ruta OSM.

    Recorre los pares consecutivos de la ruta y suma `length` de la mejor
    arista entre ellos. Útil para calcular distancias entre sensores que
    caen en distintas posiciones de la ruta.
    """
    g_osm = get_osm_graph()
    ruta = list(ruta_osm)
    cum = [0.0]
    for u, v in zip(ruta[:-1], ruta[1:]):
        ed = g_osm.get_edge_data(u, v) or {}
        if not ed:
            cum.append(cum[-1])
            continue
        best = min(ed.values(), key=lambda d: d.get("length", float("inf")))
        cum.append(cum[-1] + float(best.get("length", 0.0)))
    return cum


# ---------------------------------------------------------------------------
# Routing por coordenadas (entry point del routing OSM)
# ---------------------------------------------------------------------------
def route_by_coords_osm(
    lat_o: float,
    lon_o: float,
    lat_d: float,
    lon_d: float,
) -> dict[str, Any] | None:
    """Calcula el camino más corto en la red vial OSM entre dos coordenadas.

    Args:
        lat_o, lon_o: coordenadas del origen.
        lat_d, lon_d: coordenadas del destino.

    Returns:
        Dict con:
            - `coord_origen`, `coord_destino`: tuplas de entrada
            - `osm_origen`, `osm_destino`: nodos OSM más cercanos
            - `ruta_osm`: lista de nodos OSM atravesados
            - `geometry`: lista de (lat, lon) que dibuja la ruta sobre el mapa
            - `distancia_total`: metros recorridos
            - `sensores_en_ruta`: DataFrame de sensores que caen en la ruta,
              ordenados por su posición en `ruta_osm`
            - `n_sensores`, `n_nodos_osm`: cardinalidades

        `None` si origen y destino mapean al mismo nodo OSM o no hay camino.
    """
    import osmnx as ox  # lazy

    g_osm = get_osm_graph()
    sensors = get_sensors_df()

    osm_o = int(ox.nearest_nodes(g_osm, X=lon_o, Y=lat_o))
    osm_d = int(ox.nearest_nodes(g_osm, X=lon_d, Y=lat_d))
    if osm_o == osm_d:
        logger.warning("Origen y destino mapean al mismo nodo OSM (%d).", osm_o)
        return None
    try:
        ruta_osm = nx.shortest_path(g_osm, osm_o, osm_d, weight="length")
    except nx.NetworkXNoPath:
        logger.warning("No hay ruta OSM entre %d y %d.", osm_o, osm_d)
        return None

    # Reconstrucción de la geometría siguiendo las aristas (con shapes
    # internos donde existan, fallback a línea recta entre nodos).
    geometry: list[tuple[float, float]] = []
    dist_total = 0.0
    for u, v in zip(ruta_osm[:-1], ruta_osm[1:]):
        ed = g_osm.get_edge_data(u, v) or {}
        if not ed:
            continue
        best = min(ed.values(), key=lambda d: d.get("length", float("inf")))
        dist_total += float(best.get("length", 0.0))
        if best.get("geometry") is not None:
            for lon, lat in best["geometry"].coords:
                geometry.append((float(lat), float(lon)))
        else:
            geometry.append((float(g_osm.nodes[u]["y"]), float(g_osm.nodes[u]["x"])))
            geometry.append((float(g_osm.nodes[v]["y"]), float(g_osm.nodes[v]["x"])))

    # Sensores cuyo `osm_node` cae en la ruta — orden por posición en la ruta.
    pos_in_route = {n: i for i, n in enumerate(ruta_osm)}
    mask = sensors["osm_node"].isin(pos_in_route)
    sens_route = sensors[mask].copy()
    sens_route["pos_ruta"] = sens_route["osm_node"].map(pos_in_route)
    sens_route = sens_route.sort_values("pos_ruta").reset_index(drop=True)

    return {
        "coord_origen": (lat_o, lon_o),
        "coord_destino": (lat_d, lon_d),
        "osm_origen": osm_o,
        "osm_destino": osm_d,
        "ruta_osm": ruta_osm,
        "geometry": geometry,
        "distancia_total": round(dist_total, 1),
        "sensores_en_ruta": sens_route,
        "n_sensores": len(sens_route),
        "n_nodos_osm": len(ruta_osm),
    }

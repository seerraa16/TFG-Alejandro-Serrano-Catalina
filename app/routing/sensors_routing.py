"""Routing sobre el grafo de sensores (Dijkstra con sensores como nodos).

Cada sensor es un nodo; las aristas conectan sensores adyacentes en la red
vial real con peso = distancia OSM en metros. Esta es la ruta "lógica" en
términos del modelo: la secuencia de sensores que el vehículo atravesará.
"""

from __future__ import annotations

import logging
from typing import Any

import networkx as nx
import numpy as np
import pandas as pd

from app.core.config import settings
from app.routing.graph_loader import (
    get_ball_tree,
    get_sensor_graph,
    get_sensors_df,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Snap GPS → sensor más cercano
# ---------------------------------------------------------------------------
def find_nearest_sensor_candidates(
    lat: float,
    lon: float,
    k: int = 10,
) -> list[tuple[pd.Series, float]]:
    """Devuelve los k sensores más cercanos a (lat, lon) por distancia haversine.

    Args:
        lat, lon: coordenadas en grados decimales.
        k: número de candidatos a devolver, ordenados por proximidad.

    Returns:
        Lista de tuplas `(fila_sensor, distancia_m)`. La fila es la `pd.Series`
        del DataFrame `sensors` (con columnas `id`, `nombre`, `latitud`,
        `longitud`, `tipo_elem`, `osm_node`).
    """
    tree = get_ball_tree()
    sensors = get_sensors_df()

    q = np.radians([[lat, lon]])
    dist_rad, idx = tree.query(q, k=k)

    out: list[tuple[pd.Series, float]] = []
    for i in range(k):
        row = sensors.iloc[int(idx[0, i])]
        d_m = float(dist_rad[0, i]) * settings.EARTH_RADIUS_M
        out.append((row, round(d_m, 1)))
    return out


# ---------------------------------------------------------------------------
# Dijkstra sobre el grafo de sensores
# ---------------------------------------------------------------------------
def find_route(sensor_origen: int, sensor_destino: int) -> dict[str, Any]:
    """Camino más corto en el grafo de sensores entre dos sensor_id.

    Args:
        sensor_origen: sensor_id de inicio.
        sensor_destino: sensor_id de destino.

    Returns:
        Dict con:
            - `ruta`: lista ordenada de sensor_id desde origen hasta destino
            - `tramos`: lista de dicts con `orden`, `origen`, `destino`,
              `dist_m` y `sentido` para cada par consecutivo
            - `distancia_total`: suma de pesos en metros
            - `n_sensores`: longitud de la ruta

    Raises:
        ValueError: si alguno de los sensores no está en el grafo o no hay
            camino dirigido entre ellos.
    """
    G = get_sensor_graph()

    if sensor_origen not in G.nodes:
        raise ValueError(f"Sensor origen {sensor_origen!r} no está en el grafo")
    if sensor_destino not in G.nodes:
        raise ValueError(f"Sensor destino {sensor_destino!r} no está en el grafo")

    try:
        ruta = nx.shortest_path(G, sensor_origen, sensor_destino, weight="weight")
    except nx.NetworkXNoPath as e:
        raise ValueError(
            f"No hay ruta dirigida {sensor_origen!r} → {sensor_destino!r}"
        ) from e

    tramos: list[dict[str, Any]] = []
    dist_total = 0.0
    for orden, (u, v) in enumerate(zip(ruta[:-1], ruta[1:]), start=1):
        # En MultiDiGraph puede haber varias aristas u→v; escogemos la mínima.
        edge_data = min(G[u][v].values(), key=lambda d: d.get("weight", float("inf")))
        d = float(edge_data.get("weight", 0.0))
        tramos.append({
            "orden": orden,
            "origen": u,
            "destino": v,
            "dist_m": round(d, 1),
            "sentido": edge_data.get("sentido", "?"),
        })
        dist_total += d

    return {
        "ruta": ruta,
        "tramos": tramos,
        "distancia_total": round(dist_total, 1),
        "n_sensores": len(ruta),
    }


# ---------------------------------------------------------------------------
# Routing por coordenadas (entry point del routing por sensores)
# ---------------------------------------------------------------------------
def route_by_coords(
    lat_o: float,
    lon_o: float,
    lat_d: float,
    lon_d: float,
    k_fallback: int = 10,
) -> dict[str, Any] | None:
    """Calcula la ruta entre dos coordenadas usando el grafo de sensores.

    Snapea origen y destino a sus k sensores más cercanos y prueba pares
    ordenados por distancia total snap (origen + destino), quedándose con el
    primer par que tenga camino dirigido en el grafo. Esto evita que un
    sensor sin conexión saliente bloquee toda la ruta.

    Args:
        lat_o, lon_o: coordenadas del origen.
        lat_d, lon_d: coordenadas del destino.
        k_fallback: cuántos sensores cercanos probar por extremo.

    Returns:
        Dict combinando el resultado de `find_route` con info de snap:
        `coord_origen`, `coord_destino`, `sensor_origen`, `sensor_destino`,
        `snap_origen_m`, `snap_destino_m`. `None` si ningún par de candidatos
        está conectado.
    """
    G = get_sensor_graph()
    cands_a = find_nearest_sensor_candidates(lat_o, lon_o, k=k_fallback)
    cands_b = find_nearest_sensor_candidates(lat_d, lon_d, k=k_fallback)

    pairs = [
        (ra, rb, da, db)
        for ra, da in cands_a
        for rb, db in cands_b
        if ra["id"] != rb["id"]
    ]
    pairs.sort(key=lambda p: p[2] + p[3])

    for ra, rb, da, db in pairs:
        sa, sb = ra["id"], rb["id"]
        if not nx.has_path(G, sa, sb):
            continue
        res = find_route(sa, sb)
        res.update({
            "coord_origen": (lat_o, lon_o),
            "coord_destino": (lat_d, lon_d),
            "sensor_origen": {
                "id": sa,
                "nombre": str(ra["nombre"]),
                "lat": float(ra["latitud"]),
                "lon": float(ra["longitud"]),
            },
            "sensor_destino": {
                "id": sb,
                "nombre": str(rb["nombre"]),
                "lat": float(rb["latitud"]),
                "lon": float(rb["longitud"]),
            },
            "snap_origen_m": da,
            "snap_destino_m": db,
        })
        return res

    logger.warning(
        "Sin ruta dirigida en los %d sensores más cercanos a origen/destino.",
        k_fallback,
    )
    return None

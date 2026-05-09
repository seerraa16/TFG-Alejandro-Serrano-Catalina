"""Carga lazy de grafos y estructuras de routing.

Mantiene en memoria de proceso (singleton) las cuatro estructuras que las
funciones de routing necesitan:

    - sensor graph (NetworkX MultiDiGraph) leído de un .graphml
    - DataFrame `sensors` reconstruido a partir del grafo
    - BallTree haversine sobre las coordenadas de los sensores
    - OSM road graph (descargado vía OSMnx la primera vez)

Todas las cargas son perezosas: la primera llamada a cada `get_*()` dispara
la carga; las siguientes la reutilizan. `preload_all()` permite forzar la
carga al arrancar la API (útil para wirearlo en el lifespan de FastAPI).
"""

from __future__ import annotations

import logging
from typing import Any

import networkx as nx
import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

from app.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Estado interno (caches singleton)
# ---------------------------------------------------------------------------
_sensor_graph: nx.MultiDiGraph | None = None
_osm_graph: nx.MultiDiGraph | None = None
_sensors_df: pd.DataFrame | None = None
_ball_tree: BallTree | None = None
_tipo_elem_int: dict[int, int] | None = None


# ---------------------------------------------------------------------------
# Carga del grafo de sensores y derivados
# ---------------------------------------------------------------------------
def _try_int(x: Any) -> Any:
    try:
        return int(x)
    except (ValueError, TypeError):
        return x


def _load_sensor_graph() -> nx.MultiDiGraph:
    """Lee el .graphml de sensores y casta atributos a sus tipos correctos.

    GraphML serializa los IDs como str — los convertimos a int para que el
    sensor_id case con el tipo del parquet de tráfico.
    """
    path = settings.GRAPH_SENSORES
    if not path.exists():
        raise FileNotFoundError(f"No se encontró el grafo de sensores en {path}")

    logger.info("Cargando grafo de sensores desde %s ...", path)
    g_str = nx.read_graphml(str(path), force_multigraph=True)

    mapping = {n: _try_int(n) for n in g_str.nodes}
    G = nx.relabel_nodes(g_str, mapping)

    for _, d in G.nodes(data=True):
        d["lat"] = float(d["lat"])
        d["lon"] = float(d["lon"])
        if "osm_node" in d:
            d["osm_node"] = int(d["osm_node"])
    for _, _, d in G.edges(data=True):
        d["weight"] = float(d.get("weight", 0))
        if "length" in d:
            d["length"] = float(d["length"])
        if "bearing" in d:
            d["bearing"] = float(d["bearing"])

    logger.info(
        "Grafo de sensores cargado: %d nodos / %d aristas",
        G.number_of_nodes(),
        G.number_of_edges(),
    )
    return G


def _build_sensors_df(G: nx.MultiDiGraph) -> pd.DataFrame:
    """Reconstruye el DataFrame `sensors` con los atributos de los nodos."""
    rows = [
        {
            "id": n,
            "nombre": d.get("nombre", ""),
            "latitud": d["lat"],
            "longitud": d["lon"],
            "tipo_elem": d.get("tipo_elem", "URB"),
            "osm_node": int(d.get("osm_node", -1)),
        }
        for n, d in G.nodes(data=True)
    ]
    return pd.DataFrame(rows)


def _build_ball_tree(sensors: pd.DataFrame) -> BallTree:
    """BallTree haversine en radianes para snap GPS → sensor más cercano."""
    coords_rad = np.radians(sensors[["latitud", "longitud"]].values)
    return BallTree(coords_rad, metric="haversine")


def _build_tipo_elem_int(sensors: pd.DataFrame) -> dict[int, int]:
    """Mapping `sensor_id -> 0|1` para distinguir URB/M30 desde código numérico."""
    tipo_str_to_int = {
        "M30": settings.TIPO_ELEM_M30,
        "URB": settings.TIPO_ELEM_URB,
    }
    return {
        row["id"]: tipo_str_to_int.get(row["tipo_elem"], settings.TIPO_ELEM_URB)
        for _, row in sensors.iterrows()
    }


# ---------------------------------------------------------------------------
# Carga del grafo OSM (descarga vía OSMnx)
# ---------------------------------------------------------------------------
def _load_osm_graph(sensors: pd.DataFrame) -> nx.MultiDiGraph:
    """Descarga la red vial OSM cubriendo el bbox de los sensores.

    OSMnx cachea las descargas en disco; la primera llamada tarda 1-2 min,
    las siguientes son instantáneas.
    Devuelve el subgrafo enrutable (mayor componente fuertemente conexa).
    """
    # Imports perezosos: osmnx + shapely tardan en importar y traen geopandas.
    import osmnx as ox
    from shapely.geometry import box as shapely_box

    margin = settings.GRAPH_OSM_MARGIN
    north = sensors["latitud"].max() + margin
    south = sensors["latitud"].min() - margin
    east = sensors["longitud"].max() + margin
    west = sensors["longitud"].min() - margin
    area = shapely_box(west, south, east, north)

    logger.info("Descargando red OSM (1-2 min la primera vez, después cacheada)...")
    g_osm = ox.graph_from_polygon(
        area, network_type="drive", retain_all=True, simplify=True,
    )
    logger.info("OSM completo: %d nodos / %d aristas", len(g_osm.nodes), len(g_osm.edges))

    # Subgrafo enrutable = mayor componente fuertemente conexa
    scc = max(nx.strongly_connected_components(g_osm), key=len)
    g_osm_routable = g_osm.subgraph(scc).copy()
    logger.info(
        "OSM enrutable (SCC): %d nodos / %d aristas",
        len(g_osm_routable.nodes),
        len(g_osm_routable.edges),
    )
    return g_osm_routable


# ---------------------------------------------------------------------------
# API pública del módulo
# ---------------------------------------------------------------------------
def get_sensor_graph() -> nx.MultiDiGraph:
    """Devuelve el grafo de sensores. Lo carga la primera vez."""
    global _sensor_graph
    if _sensor_graph is None:
        _sensor_graph = _load_sensor_graph()
    return _sensor_graph


def get_sensors_df() -> pd.DataFrame:
    """Devuelve el DataFrame `sensors`. Reconstruido a partir del grafo."""
    global _sensors_df
    if _sensors_df is None:
        _sensors_df = _build_sensors_df(get_sensor_graph())
    return _sensors_df


def get_ball_tree() -> BallTree:
    """Devuelve el BallTree haversine para snap por coordenadas."""
    global _ball_tree
    if _ball_tree is None:
        _ball_tree = _build_ball_tree(get_sensors_df())
    return _ball_tree


def get_tipo_elem_int() -> dict[int, int]:
    """Mapping `sensor_id -> int` para BPR (0=URB, 1=M30)."""
    global _tipo_elem_int
    if _tipo_elem_int is None:
        _tipo_elem_int = _build_tipo_elem_int(get_sensors_df())
    return _tipo_elem_int


def get_osm_graph() -> nx.MultiDiGraph:
    """Devuelve el grafo OSM enrutable. Descarga la primera vez (lento)."""
    global _osm_graph
    if _osm_graph is None:
        _osm_graph = _load_osm_graph(get_sensors_df())
    return _osm_graph


def preload_all(include_osm: bool = True) -> None:
    """Carga eager de todas las estructuras. Útil en el lifespan de FastAPI.

    Si `include_osm=False`, omite la descarga OSM (útil en arranques rápidos
    de desarrollo donde sólo se va a usar routing por sensores).
    """
    get_sensor_graph()
    get_sensors_df()
    get_ball_tree()
    get_tipo_elem_int()
    if include_osm:
        get_osm_graph()

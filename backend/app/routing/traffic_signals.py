"""Detección de semáforos en ruta OSM y cálculo de demora estimada.

Los nodos OSM con highway=traffic_signals representan semáforos reales.
La demora por semáforo varía según la franja horaria (punta/valle/noche).

Nota: el grafo OSM se descarga con simplify=True, por lo que nodos
intermedios sin intersección pueden haber sido fusionados. Esta función
captura los semáforos que permanecen como nodos de intersección, que
representan la mayoría de las paradas relevantes en tráfico urbano.
"""
from __future__ import annotations

from typing import Sequence

import networkx as nx


def signal_delay_per_light(hour: int) -> float:
    """Demora media estimada (segundos) por semáforo según la hora del día.

    Franjas para Madrid urbano:
        07-10 h  →  35 s  (punta mañana)
        17-20 h  →  35 s  (punta tarde)
        22-07 h  →  15 s  (noche / madrugada — muchos en ámbar intermitente)
        resto    →  22 s  (valle: 10-17 h y 20-22 h)
    """
    if (7 <= hour < 10) or (17 <= hour < 20):
        return 35.0
    if hour >= 22 or hour < 7:
        return 15.0
    return 22.0


def get_signal_positions(
    ruta_osm: Sequence[int],
    g_osm: nx.MultiDiGraph,
) -> list[tuple[float, float]]:
    """Devuelve lista de (lat, lon) de los semáforos presentes en la ruta."""
    positions = []
    for n in ruta_osm:
        if g_osm.nodes[n].get("highway") == "traffic_signals":
            nd = g_osm.nodes[n]
            positions.append((float(nd["y"]), float(nd["x"])))
    return positions


def count_signals_on_route(
    ruta_osm: Sequence[int],
    g_osm: nx.MultiDiGraph,
) -> int:
    """Cuenta nodos con tag `highway=traffic_signals` en la lista de nodos OSM."""
    return len(get_signal_positions(ruta_osm, g_osm))


def compute_signal_delay(
    ruta_osm: Sequence[int],
    g_osm: nx.MultiDiGraph,
    hour: int,
) -> tuple[int, float, list[tuple[float, float]]]:
    """Devuelve ``(n_semaforos, demora_total_s, positions)`` para la ruta y hora dadas."""
    positions = get_signal_positions(ruta_osm, g_osm)
    n = len(positions)
    delay_s = n * signal_delay_per_light(hour)
    return n, round(delay_s, 1), positions

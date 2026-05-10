"""Cálculo de velocidad media (vmed) y ETA a partir de predicciones de tráfico.

Versión ajustada para penalizar más agresivamente la congestión real.
Objetivo:
- evitar velocidades demasiado optimistas
- reaccionar antes ante aumentos de carga/ocupación
- producir ETAs más realistas en tráfico urbano

Cambios principales:
- BPR más agresivo:
    alpha = 1.0
    beta = 2.0
- Penalización por ocupación más fuerte y lineal
- Velocidades mínimas más realistas
"""

from __future__ import annotations

from typing import Mapping, Sequence, TypedDict

import pandas as pd

from app.core.config import settings


# ---------------------------------------------------------------------------
# Tipos
# ---------------------------------------------------------------------------
class TramoInfo(TypedDict, total=False):
    tramo: int
    sensor_a: int
    sensor_b: int
    dist_m: float
    vmed_a_kmh: float | None
    vmed_b_kmh: float | None
    v_tramo_kmh: float | None
    tiempo_s: float | None
    skip: str


class EtaResult(TypedDict, total=False):
    tramos: list[TramoInfo]
    tiempo_total_s: float
    tiempo_total_min: float
    distancia_total_m: float
    velocidad_media_efectiva_kmh: float | None
    error: str


# ---------------------------------------------------------------------------
# Velocidad media por sensor
# ---------------------------------------------------------------------------
def vmed_from_predictions(
    intensidad: float,
    ocupacion: float,
    carga: float,
    tipo_elem: int,
    *,
    alpha: float = 1.0,
    beta: float = 2.0,
    capacity_q: int = settings.BPR_CAPACIDAD,
    v_libre_m30: float = settings.BPR_V_LIBRE_M30,
    v_libre_urb: float = settings.BPR_V_LIBRE_URB,
    v_libre_override: float | None = None,  # [OSM-SPEED] velocidad libre real del tramo
) -> float:
    """Calcula velocidad media estimada (km/h).

    Modelo más agresivo frente a congestión:
    - Penaliza antes la saturación
    - Penaliza más la ocupación
    - Reduce velocidades irreales demasiado optimistas
    """

    # ---------------------------------------------------------
    # Velocidad libre según tipo de vía (o límite real OSM si se pasa)
    # ---------------------------------------------------------
    if v_libre_override is not None:  # [OSM-SPEED]
        v_libre = v_libre_override
    elif int(tipo_elem) == settings.TIPO_ELEM_M30:
        v_libre = v_libre_m30
    else:
        v_libre = v_libre_urb

    # ---------------------------------------------------------
    # Ratio de congestión
    # ---------------------------------------------------------
    carga_norm = max(0.0, min(100.0, float(carga))) / 100.0

    # fallback si carga viene vacía o casi cero
    intensidad_ratio = max(0.0, float(intensidad)) / capacity_q

    # combinar ambas señales
    ratio = max(carga_norm, intensidad_ratio)

    # limitar ratio
    ratio = min(1.5, ratio)

    # ---------------------------------------------------------
    # BPR más agresivo
    # ---------------------------------------------------------
    v_bpr = v_libre / (1.0 + alpha * (ratio**beta))

    # ---------------------------------------------------------
    # Penalización fuerte por ocupación
    # ---------------------------------------------------------
    occ = max(0.0, min(100.0, float(ocupacion))) / 100.0

    # penalización más realista
    # ejemplo:
    # 20% occ -> 0.70
    # 40% occ -> 0.40
    # 60% occ -> 0.20
    f_occ = max(0.20, 1.0 - 1.5 * occ)

    # ---------------------------------------------------------
    # Velocidad final
    # ---------------------------------------------------------
    v_final = v_bpr * f_occ

    # ---------------------------------------------------------
    # Mínimos realistas
    # ---------------------------------------------------------
    if int(tipo_elem) == settings.TIPO_ELEM_M30:
        v_min = 20.0
    else:
        v_min = 10.0

    return max(v_min, min(v_final, v_libre))


# ---------------------------------------------------------------------------
# ETA total para una ruta
# ---------------------------------------------------------------------------
def compute_eta(
    sensor_ids: Sequence[int],
    distancias_m: Sequence[float],
    predictions_df: pd.DataFrame | None,
    tipo_elem_int: Mapping[int, int],
    v_libre_per_sensor: dict[int, float] | None = None,  # [OSM-SPEED]
) -> EtaResult:
    """Calcula ETA total y tiempos por tramo."""

    if predictions_df is None or len(predictions_df) == 0:
        return {"error": "Sin predicciones"}

    # ---------------------------------------------------------
    # Velocidades por sensor
    # ---------------------------------------------------------
    vmeds: dict[int, float] = {}

    for sid in predictions_df.index:
        row = predictions_df.loc[sid]

        vmeds[int(sid)] = vmed_from_predictions(
            intensidad=row["intensidad"],
            ocupacion=row["ocupacion"],
            carga=row["carga"],
            tipo_elem=tipo_elem_int.get(sid, settings.TIPO_ELEM_URB),
            v_libre_override=(  # [OSM-SPEED]
                v_libre_per_sensor.get(int(sid)) if v_libre_per_sensor else None
            ),
        )

    # ---------------------------------------------------------
    # Calcular tiempos por tramo
    # ---------------------------------------------------------
    tramos: list[TramoInfo] = []
    t_total = 0.0

    for i in range(len(sensor_ids) - 1):
        sid_a = int(sensor_ids[i])
        sid_b = int(sensor_ids[i + 1])

        d_m = float(distancias_m[i])

        v_a = vmeds.get(sid_a)
        v_b = vmeds.get(sid_b)

        if v_a is None or v_b is None:
            tramos.append({
                "tramo": i + 1,
                "sensor_a": sid_a,
                "sensor_b": sid_b,
                "dist_m": d_m,
                "vmed_a_kmh": v_a,
                "vmed_b_kmh": v_b,
                "v_tramo_kmh": None,
                "tiempo_s": None,
                "skip": "sin predicción en uno de los extremos",
            })
            continue

        # velocidad media del tramo
        v_tramo = (v_a + v_b) / 2.0

        # evitar divisiones raras
        if v_tramo <= 0:
            continue

        # km/h -> m/s
        v_ms = v_tramo / 3.6

        # tiempo del tramo
        t_tramo = d_m / v_ms

        tramos.append({
            "tramo": i + 1,
            "sensor_a": sid_a,
            "sensor_b": sid_b,
            "dist_m": round(d_m, 1),
            "vmed_a_kmh": round(v_a, 2),
            "vmed_b_kmh": round(v_b, 2),
            "v_tramo_kmh": round(v_tramo, 2),
            "tiempo_s": round(t_tramo, 1),
        })

        t_total += t_tramo

    # ---------------------------------------------------------
    # Totales
    # ---------------------------------------------------------
    dist_total = float(sum(distancias_m))

    return {
        "tramos": tramos,
        "tiempo_total_s": round(t_total, 1),
        "tiempo_total_min": round(t_total / 60, 2),
        "distancia_total_m": round(dist_total, 1),
        "velocidad_media_efectiva_kmh": (
            round((dist_total / t_total) * 3.6, 2)
            if t_total > 0
            else None
        ),
    }
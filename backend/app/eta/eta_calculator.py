"""Cálculo de velocidad media (vmed) y ETA a partir de predicciones de tráfico.

Migrado desde `inferencia_app.ipynb` (celda 15). Algoritmo idéntico al del
notebook; sólo se han añadido tipados, docstrings detallados y desacople
de las constantes globales (que viven ahora en `app.core.config`).

Funciones públicas:
    - vmed_from_predictions: km/h por sensor a partir de (intensidad, ocupación, carga)
    - compute_eta: tiempo total y desglose por tramos para una secuencia de sensores

Dependencias externas: pandas (sólo para la firma de `compute_eta`).
"""

from __future__ import annotations

from typing import Mapping, Sequence, TypedDict

import pandas as pd

from app.core.config import settings


# ---------------------------------------------------------------------------
# Tipos
# ---------------------------------------------------------------------------
class TramoInfo(TypedDict, total=False):
    """Información de un tramo individual entre dos sensores consecutivos."""

    tramo: int
    sensor_a: int
    sensor_b: int
    dist_m: float
    vmed_a_kmh: float | None
    vmed_b_kmh: float | None
    v_tramo_kmh: float | None
    tiempo_s: float | None
    skip: str  # presente sólo cuando falta predicción en alguno de los extremos


class EtaResult(TypedDict, total=False):
    """Resultado de `compute_eta`. Si hay error, sólo aparece el campo `error`."""

    tramos: list[TramoInfo]
    tiempo_total_s: float
    tiempo_total_min: float
    distancia_total_m: float
    velocidad_media_efectiva_kmh: float | None
    error: str


# ---------------------------------------------------------------------------
# Velocidad media por sensor (BPR + corrección por ocupación)
# ---------------------------------------------------------------------------
def vmed_from_predictions(
    intensidad: float,
    ocupacion: float,
    carga: float,
    tipo_elem: int,
    *,
    alpha: float = settings.BPR_ALPHA,
    beta: float = settings.BPR_BETA,
    capacity_q: int = settings.BPR_CAPACIDAD,
    v_libre_m30: float = settings.BPR_V_LIBRE_M30,
    v_libre_urb: float = settings.BPR_V_LIBRE_URB,
) -> float:
    """Calcula la velocidad media (km/h) en un sensor.

    Combina la fórmula BPR (saturación tráfico/capacidad) con una penalización
    por ocupación física del carril. El resultado se acota a un mínimo de 5 km/h
    para evitar tiempos de tramo absurdos en condiciones extremas.

    Args:
        intensidad: vehículos / 15 min predichos para el sensor.
        ocupacion: porcentaje de ocupación física del carril (0-100).
        carga: porcentaje de saturación Q/C (0-100). Si es ~0 se usa
            `intensidad / capacity_q` como fallback (sensores donde la
            carga no se reporta).
        tipo_elem: 1 (M30, autovía) o 0 (URB, urbano). Determina v_libre.
        alpha, beta: parámetros BPR estándar.
        capacity_q: capacidad nominal en veh/15 min (sólo se usa en fallback).
        v_libre_m30, v_libre_urb: velocidades libres por tipo de sensor (km/h).

    Returns:
        Velocidad media en km/h, acotada a [5, v_libre].
    """
    v_libre = v_libre_m30 if int(tipo_elem) == settings.TIPO_ELEM_M30 else v_libre_urb

    # Saturación Q/C: usar carga (ya en %), fallback a intensidad/capacidad
    carga_norm = max(0.0, min(100.0, float(carga))) / 100.0
    if carga_norm > 1e-3:
        ratio = carga_norm
    else:
        ratio = max(0.0, float(intensidad)) / capacity_q

    v_bpr = v_libre / (1.0 + alpha * ratio**beta)

    # Penalización por ocupación física (>30% ya tiene efecto notable)
    occ = max(0.0, min(100.0, float(ocupacion))) / 100.0
    f_occ = max(0.15, 1.0 - 0.6 * occ**2)

    return max(5.0, v_bpr * f_occ)


# ---------------------------------------------------------------------------
# ETA total para una ruta
# ---------------------------------------------------------------------------
def compute_eta(
    sensor_ids: Sequence[int],
    distancias_m: Sequence[float],
    predictions_df: pd.DataFrame | None,
    tipo_elem_int: Mapping[int, int],
) -> EtaResult:
    """Calcula tiempo y velocidad por tramo y total para una secuencia de sensores.

    Para cada tramo entre los sensores i e i+1:
        v_tramo = media de vmeds en ambos extremos
        t_tramo = distancia / (v_tramo / 3.6)

    Args:
        sensor_ids: secuencia ordenada de sensor_id que componen la ruta.
        distancias_m: distancia en metros de cada tramo. `len == len(sensor_ids) - 1`.
        predictions_df: DataFrame indexado por sensor_id con columnas
            `intensidad`, `ocupacion`, `carga`. Sensores sin entrada se
            saltan (el tramo se marca como "skip").
        tipo_elem_int: mapping `sensor_id -> 0|1` para distinguir URB/M30.
            Sensores ausentes se asumen URB (defensivo).

    Returns:
        Dict con `tramos`, `tiempo_total_s`, `tiempo_total_min`,
        `distancia_total_m` y `velocidad_media_efectiva_kmh`.
        Si `predictions_df` está vacío, devuelve `{"error": "Sin predicciones"}`.
    """
    if predictions_df is None or len(predictions_df) == 0:
        return {"error": "Sin predicciones"}

    # 1) Calcular vmed por sensor predicho
    vmeds: dict[int, float] = {}
    for sid in predictions_df.index:
        row = predictions_df.loc[sid]
        vmeds[int(sid)] = vmed_from_predictions(
            row["intensidad"],
            row["ocupacion"],
            row["carga"],
            tipo_elem_int.get(sid, settings.TIPO_ELEM_URB),
        )

    # 2) Recorrer tramos
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
                "skip": "sin predicción en uno de los dos extremos",
            })
            continue

        v_tramo = (v_a + v_b) / 2
        t_tramo = d_m / (v_tramo / 3.6) if v_tramo > 0 else 0.0
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

    # 3) Totales
    dist_total = float(sum(distancias_m))
    return {
        "tramos": tramos,
        "tiempo_total_s": round(t_total, 1),
        "tiempo_total_min": round(t_total / 60, 2),
        "distancia_total_m": round(dist_total, 1),
        "velocidad_media_efectiva_kmh": (
            round((dist_total / t_total) * 3.6, 2) if t_total > 0 else None
        ),
    }

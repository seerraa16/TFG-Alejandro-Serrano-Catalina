"""Construcción de features para inferencia LSTM.

Migrado de `inferencia_app.ipynb` (celdas 11 y 29). Dos responsabilidades:

    - `build_features_anytime`: para una fecha cualquiera (futura o pasada),
      sintetiza las 22 features que el modelo espera por sensor, combinando
      perfiles históricos (PROFILE_IDX) con weather y flags de accidente.

    - `build_sequences`: pasa de un DataFrame de filas (con todas las features
      lag y context) al tensor (N, 4, 22) que el LSTM consume.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd

from app.prediction.data_cache import get_profile_idx

# ---------------------------------------------------------------------------
# Schema del modelo LSTM (idéntico a inferencia_app.ipynb celda 2)
# ---------------------------------------------------------------------------
TARGET_COLS: tuple[str, ...] = ("intensidad_trafico", "ocupacion", "carga")

# Pasos temporales que componen la secuencia. El modelo recibe (N, 4, 22)
# con t-4, t-3, t-2, t-1 (orden creciente en proximidad al momento objetivo).
SEQ_STEPS: tuple[int, ...] = (4, 3, 2, 1)
SEQ_LEN: int = len(SEQ_STEPS)

# 19 columnas de contexto que se replican en cada step de la secuencia.
CONTEXT_COLS: tuple[str, ...] = (
    "slot_sin", "slot_cos",
    "dia_sem_sin", "dia_sem_cos",
    "mes_sin", "mes_cos",
    "es_laborable",
    "lluvia_ord", "precip_mm",
    "hay_accidente", "accidente_reciente_1h", "tiempo_accidente_norm",
    "tipo_elem",
    "intensidad_trafico_roll4", "intensidad_trafico_roll8",
    "ocupacion_roll4", "ocupacion_roll8",
    "carga_roll4", "carga_roll8",
)

# Cada step añade 3 cols de tráfico lagged → 19 + 3 = 22 features por step.
N_FEATURES: int = len(CONTEXT_COLS) + 3
TIMESTEPS_PER_DAY: int = 96  # 96 slots de 15 min


# ---------------------------------------------------------------------------
# Lookup de perfil histórico (con fallback a ceros si la clave no existe)
# ---------------------------------------------------------------------------
_DEFAULT_PROFILE = {"intensidad": 0.0, "ocupacion": 0.0, "carga": 0.0}


def _profile_lookup(sensor_id: int, slot: int, dow: int) -> dict[str, float]:
    """Devuelve el perfil medio (intensidad, ocupacion, carga) para una clave.

    `slot` se reduce módulo 96 y `dow` módulo 7 para que valores fuera de
    rango (al hacer aritmética con timestamps) sigan dando un perfil válido.
    Devuelve ceros si la combinación (sensor, slot, dow) no se observó en
    el dataset de entrenamiento.
    """
    profiles = get_profile_idx()
    key = (int(sensor_id), int(slot) % TIMESTEPS_PER_DAY, int(dow) % 7)
    return profiles.get(key, _DEFAULT_PROFILE)


# ---------------------------------------------------------------------------
# Construcción de features para una fecha cualquiera
# ---------------------------------------------------------------------------
def build_features_anytime(
    sensor_id: int,
    dt: pd.Timestamp | datetime | str,
    weather: dict[str, Any],
    tipo_elem: int,
    accidente: bool = False,
) -> dict[str, float | int]:
    """Sintetiza el dict de features para un sensor en un instante dado.

    Combina:
      - perfiles históricos por (sensor, slot, dow) para los 8 últimos lags
        y los rolling means (4 y 8 muestras)
      - codificación cíclica del momento objetivo (slot, día semana, mes)
      - lluvia derivada del weather (lluvia_ord + precip_mm)
      - flags de accidente (todos a cero por defecto)
      - tipo_elem como entero (0=URB, 1=M30)

    Args:
        sensor_id: identificador del sensor.
        dt: instante objetivo de predicción (no se mira el sensor en este
            instante — se construye sintéticamente desde perfiles).
        weather: dict con al menos `lluvia_ord` y `precip_mm`. Cualquier
            otra clave se ignora.
        tipo_elem: 0 (URB) o 1 (M30).
        accidente: si True, marca `hay_accidente=1`, `accidente_reciente_1h=1`
            y `tiempo_accidente_norm=0.5` (simula incidente reciente).

    Returns:
        Dict con las 22 features que `build_sequences` necesita.
    """
    ts = pd.Timestamp(dt)

    # Lags 1..8 (los 4 últimos van como features explícitas; los 8 alimentan
    # las rolling means). Para "futuro" estos lags son perfiles medios.
    samples: dict[int, dict[str, float]] = {}
    for k in range(1, 9):
        t_lag = ts - timedelta(minutes=15 * k)
        slot = t_lag.hour * 4 + t_lag.minute // 15
        dow = t_lag.dayofweek
        samples[k] = _profile_lookup(sensor_id, slot, dow)

    feat: dict[str, float | int] = {}

    # Lags explícitas 1..4
    for k in (1, 2, 3, 4):
        feat[f"intensidad_trafico_lag{k}"] = samples[k]["intensidad"]
        feat[f"ocupacion_lag{k}"] = samples[k]["ocupacion"]
        feat[f"carga_lag{k}"] = samples[k]["carga"]

    # Rolling means
    intens4 = [samples[k]["intensidad"] for k in (1, 2, 3, 4)]
    occ4 = [samples[k]["ocupacion"] for k in (1, 2, 3, 4)]
    car4 = [samples[k]["carga"] for k in (1, 2, 3, 4)]
    intens8 = [samples[k]["intensidad"] for k in range(1, 9)]
    occ8 = [samples[k]["ocupacion"] for k in range(1, 9)]
    car8 = [samples[k]["carga"] for k in range(1, 9)]
    feat["intensidad_trafico_roll4"] = float(np.mean(intens4))
    feat["intensidad_trafico_roll8"] = float(np.mean(intens8))
    feat["ocupacion_roll4"] = float(np.mean(occ4))
    feat["ocupacion_roll8"] = float(np.mean(occ8))
    feat["carga_roll4"] = float(np.mean(car4))
    feat["carga_roll8"] = float(np.mean(car8))

    # Contexto temporal cíclico
    slot_now = ts.hour * 4 + ts.minute // 15
    feat["slot_sin"] = float(np.sin(2 * np.pi * slot_now / TIMESTEPS_PER_DAY))
    feat["slot_cos"] = float(np.cos(2 * np.pi * slot_now / TIMESTEPS_PER_DAY))
    feat["dia_sem_sin"] = float(np.sin(2 * np.pi * ts.dayofweek / 7))
    feat["dia_sem_cos"] = float(np.cos(2 * np.pi * ts.dayofweek / 7))
    feat["mes_sin"] = float(np.sin(2 * np.pi * (ts.month - 1) / 12))
    feat["mes_cos"] = float(np.cos(2 * np.pi * (ts.month - 1) / 12))
    feat["es_laborable"] = 0 if ts.dayofweek >= 5 else 1

    # Lluvia (de la API o override)
    feat["lluvia_ord"] = int(weather.get("lluvia_ord", 0))
    feat["precip_mm"] = float(weather.get("precip_mm", 0.0))

    # Accidente
    if accidente:
        feat["hay_accidente"] = 1
        feat["accidente_reciente_1h"] = 1
        feat["tiempo_accidente_norm"] = 0.5
    else:
        feat["hay_accidente"] = 0
        feat["accidente_reciente_1h"] = 0
        feat["tiempo_accidente_norm"] = 0.0

    feat["tipo_elem"] = int(tipo_elem)
    return feat


# ---------------------------------------------------------------------------
# DataFrame de filas → tensor (N, 4, 22)
# ---------------------------------------------------------------------------
def build_sequences(df_rows: pd.DataFrame) -> np.ndarray:
    """Convierte filas de features en el tensor que el LSTM espera.

    Args:
        df_rows: DataFrame con TODAS las columnas que aparecen en
            CONTEXT_COLS + lag1..4 (intensidad, ocupacion, carga). Cada
            fila representa un sensor en el instante objetivo.

    Returns:
        np.ndarray float32 con shape `(N, 4, 22)` donde:
            - N = nº de sensores (una fila por sensor)
            - 4 = SEQ_LEN (steps t-4..t-1)
            - 22 = 3 features de tráfico lagged + 19 de contexto
    """
    context = df_rows.loc[:, list(CONTEXT_COLS)].values.astype("float32")
    steps = []
    for k in SEQ_STEPS:
        traffic_k = np.column_stack([
            df_rows[f"intensidad_trafico_lag{k}"].values,
            df_rows[f"ocupacion_lag{k}"].values,
            df_rows[f"carga_lag{k}"].values,
        ]).astype("float32")
        steps.append(np.concatenate([traffic_k, context], axis=1))
    return np.stack(steps, axis=1)

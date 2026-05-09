"""Inferencia LSTM batched sobre una lista de sensores.

Pega los tres pasos numéricos: scaler.transform → model.predict →
scaler.inverse_transform. No conoce nada de routing ni de weather: recibe
una lista de sensor_id y un timestamp, y devuelve predicciones en escala
original (vehículos/15 min, % ocupación, % carga).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Iterable

import numpy as np
import pandas as pd

from app.models.model_loader import get_model, is_loaded, load_model
from app.prediction.data_cache import get_scaler_x, get_scaler_y
from app.prediction.feature_builder import (
    TARGET_COLS,
    build_features_anytime,
    build_sequences,
)
from app.routing.graph_loader import get_tipo_elem_int

logger = logging.getLogger(__name__)


def predict_for_sensors(
    sensor_ids: Iterable[int],
    dt: pd.Timestamp | datetime | str,
    weather: dict,
    accidente: bool = False,
) -> tuple[pd.DataFrame, list[int]]:
    """Predice tráfico para una lista de sensores en un instante dado.

    Args:
        sensor_ids: secuencia de sensor_id sobre los que predecir.
        dt: instante objetivo (cualquier fecha futura o pasada).
        weather: dict con al menos `lluvia_ord` y `precip_mm`.
        accidente: marca todos los sensores como afectados por un incidente
            reciente (uso experimental — el modelo lo ve en las features).

    Returns:
        Tupla `(predictions_df, skipped)`:
            - `predictions_df`: DataFrame con columnas `intensidad`,
              `ocupacion`, `carga` en escala original. El índice es
              `sensor_id` (sólo los que tenían perfil histórico).
            - `skipped`: lista de sensor_id que no estaban en PROFILE_IDX
              y por tanto no se han podido predecir.
    """
    # El modelo se carga perezosamente la primera vez (al margen del lifespan
    # de FastAPI, así esta función es invocable también desde scripts/CLI).
    if not is_loaded():
        load_model()
    model = get_model()
    scaler_x = get_scaler_x()
    scaler_y = get_scaler_y()
    tipo_elem_int = get_tipo_elem_int()

    rows: list[dict] = []
    valid_ids: list[int] = []
    skipped: list[int] = []

    for sid in sensor_ids:
        sid_int = int(sid)
        # PROFILE_IDX se accede dentro de build_features_anytime; si el sensor
        # no tiene NINGÚN perfil registrado todas sus features se irán a cero,
        # lo que dará una predicción ruidosa. Mejor saltarlo.
        if not _has_profile(sid_int):
            skipped.append(sid_int)
            continue
        tipo = tipo_elem_int.get(sid_int, 0)
        feat = build_features_anytime(sid_int, dt, weather, tipo, accidente=accidente)
        rows.append(feat)
        valid_ids.append(sid_int)

    if not rows:
        logger.warning("Ningún sensor tenía perfil histórico — sin predicciones.")
        return (
            pd.DataFrame(columns=list(TARGET_COLS)).rename(
                columns={"intensidad_trafico": "intensidad"}
            ),
            skipped,
        )

    df_rows = pd.DataFrame(rows)
    X = build_sequences(df_rows)               # (N, 4, 22)
    X_n = scaler_x.transform(X.reshape(-1, X.shape[-1])).reshape(X.shape)
    y_n = model.predict(X_n, verbose=0)        # (N, 3) en escala normalizada
    y = scaler_y.inverse_transform(y_n)        # vuelta a escala original

    preds = pd.DataFrame(
        y,
        columns=["intensidad", "ocupacion", "carga"],
        index=valid_ids,
    )
    return preds, skipped


def _has_profile(sensor_id: int) -> bool:
    """¿Existe AL MENOS una entrada en PROFILE_IDX para este sensor?"""
    from app.prediction.data_cache import get_profile_idx

    profiles = get_profile_idx()
    # Hay 96 * 7 = 672 combinaciones posibles. Comprobar todas es costoso;
    # con que exista una basta para considerar al sensor "conocido".
    # Heurística: probar (sensor, 0, 0) — el slot/dow más frecuente en cualquier
    # sensor activo. Si no está, escanear hasta encontrar alguna o agotar 7 dows.
    for dow in range(7):
        if (sensor_id, 0, dow) in profiles:
            return True
    # Búsqueda exhaustiva como fallback (rara vez se llega aquí)
    return any(k[0] == sensor_id for k in profiles)

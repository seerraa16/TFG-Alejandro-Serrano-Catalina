"""Carga lazy de los caches generados por el notebook de inferencia.

Tres artefactos pesados que el notebook deja en `outputs/inferencia/`:

    - scaler_X_inference.pkl  (StandardScaler ajustado en train sobre features)
    - scaler_y_inference.pkl  (StandardScaler ajustado en train sobre targets)
    - historical_profiles.pkl (perfiles medios por sensor/slot/dow)

Se cargan a memoria del proceso la primera vez que se piden y se mantienen
en singletons. Si los archivos no existen, se lanza `FileNotFoundError`
con un mensaje explicando que hay que regenerarlos desde el notebook.
"""

from __future__ import annotations

import logging
from typing import Any

import joblib
import pandas as pd

from app.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Estado interno (singletons)
# ---------------------------------------------------------------------------
_scaler_x: Any = None
_scaler_y: Any = None
_profile_idx: dict[tuple[int, int, int], dict[str, float]] | None = None


# ---------------------------------------------------------------------------
# Errores específicos
# ---------------------------------------------------------------------------
class CacheNotFoundError(FileNotFoundError):
    """Se lanza cuando un cache de inferencia falta en disco."""


def _require(path, kind: str) -> None:
    if not path.exists():
        raise CacheNotFoundError(
            f"No se encontró el cache de {kind} en {path}. "
            f"Genera los caches ejecutando inferencia_app.ipynb (celdas 11 y 27) "
            f"o ajusta la ruta en settings."
        )


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------
def get_scaler_x() -> Any:
    """Devuelve el StandardScaler de features (X). Lo carga la primera vez."""
    global _scaler_x
    if _scaler_x is None:
        _require(settings.SCALER_X_INFERENCE, "scaler_X")
        logger.info("Cargando scaler_X desde %s", settings.SCALER_X_INFERENCE)
        _scaler_x = joblib.load(settings.SCALER_X_INFERENCE)
    return _scaler_x


def get_scaler_y() -> Any:
    """Devuelve el StandardScaler de targets (y). Lo carga la primera vez."""
    global _scaler_y
    if _scaler_y is None:
        _require(settings.SCALER_Y_INFERENCE, "scaler_y")
        logger.info("Cargando scaler_y desde %s", settings.SCALER_Y_INFERENCE)
        _scaler_y = joblib.load(settings.SCALER_Y_INFERENCE)
    return _scaler_y


def get_profile_idx() -> dict[tuple[int, int, int], dict[str, float]]:
    """Devuelve PROFILE_IDX: dict (sensor_id, slot, dow) → {intensidad, ocupacion, carga}.

    El archivo en disco es un DataFrame; se transforma a dict en memoria
    para tener lookup O(1) durante la construcción de features.
    """
    global _profile_idx
    if _profile_idx is None:
        _require(settings.HISTORICAL_PROFILES, "historical_profiles")
        logger.info("Cargando historical_profiles desde %s", settings.HISTORICAL_PROFILES)
        df = joblib.load(settings.HISTORICAL_PROFILES)
        if not isinstance(df, pd.DataFrame):
            raise TypeError(
                f"Se esperaba un DataFrame en {settings.HISTORICAL_PROFILES}, "
                f"se obtuvo {type(df).__name__}"
            )
        _profile_idx = (
            df.set_index(["id", "slot", "dow"])[["intensidad", "ocupacion", "carga"]]
            .to_dict("index")
        )
        logger.info("PROFILE_IDX listo: %d entradas", len(_profile_idx))
    return _profile_idx


def preload_all() -> None:
    """Eager-load de los 3 caches. Útil para wirearlo en el lifespan."""
    get_scaler_x()
    get_scaler_y()
    get_profile_idx()

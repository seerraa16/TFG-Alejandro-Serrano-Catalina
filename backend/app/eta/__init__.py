"""Cálculo de tiempo estimado de llegada (ETA) a partir de predicciones de tráfico."""

from app.eta.eta_calculator import (
    EtaResult,
    TramoInfo,
    compute_eta,
    vmed_from_predictions,
)

__all__ = [
    "vmed_from_predictions",
    "compute_eta",
    "TramoInfo",
    "EtaResult",
]

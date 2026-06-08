"""Carga del modelo BiLSTM v2 (PyTorch) en memoria una sola vez al arrancar la API.

Patrón de uso (desde main.py vía lifespan de FastAPI):

    from contextlib import asynccontextmanager
    from app.models.model_loader import load_model

    @asynccontextmanager
    async def lifespan(app):
        load_model()    # se ejecuta una vez al arrancar
        yield

Y desde cualquier endpoint o servicio:

    from app.models.model_loader import get_model
    model = get_model()
    y_n = model.predict(X_n)   # ndarray (N, 3), misma API que antes
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

_model: Any = None
_model_path = settings.MODEL_LSTM


# ---------------------------------------------------------------------------
# Arquitectura BiLSTM v2 (réplica exacta del notebook Modelo2.0.ipynb)
# ---------------------------------------------------------------------------
class BiLSTMv2:
    """Bidirectional LSTM de dos capas para predicción de tráfico.

    Arquitectura:
        Bidirectional(LSTM(128)) → Dropout(0.3) →
        Bidirectional(LSTM(64))  → Dropout(0.3) →
        Dense(64, ReLU) → Dense(32, ReLU) → Dense(3)

    Input:  (N, 12, 22)  — 12 pasos × 22 features
    Output: (N, 3)       — intensidad, ocupacion, carga (normalizados)
    """

    def __init__(self, n_features: int = 22, n_targets: int = 3, dropout: float = 0.3):
        import torch.nn as nn  # import local: torch puede no estar disponible en todos los entornos
        import torch

        class _Net(nn.Module):
            def __init__(self):
                super().__init__()
                self.lstm1 = nn.LSTM(n_features, 128, batch_first=True, bidirectional=True)
                self.drop1 = nn.Dropout(dropout)
                self.lstm2 = nn.LSTM(2 * 128, 64, batch_first=True, bidirectional=True)
                self.drop2 = nn.Dropout(dropout)
                self.dense1 = nn.Linear(2 * 64, 64)
                self.dense2 = nn.Linear(64, 32)
                self.out = nn.Linear(32, n_targets)
                self.act = nn.ReLU()

            def forward(self, x):
                x, _ = self.lstm1(x)
                x = self.drop1(x)
                _, (h_n, _) = self.lstm2(x)
                x = torch.cat([h_n[0], h_n[1]], dim=1)
                x = self.drop2(x)
                x = self.act(self.dense1(x))
                x = self.act(self.dense2(x))
                return self.out(x)

        self._net = _Net()
        self._torch = torch

    def load_weights(self, path) -> None:
        state = self._torch.load(str(path), map_location="cpu", weights_only=True)
        self._net.load_state_dict(state)
        self._net.eval()

    def predict(self, X: np.ndarray, verbose: int = 0) -> np.ndarray:
        """Inferencia compatible con la API del modelo Keras anterior.

        Args:
            X: array float32 (N, seq_len, n_features) ya normalizado.
            verbose: ignorado (solo compatibilidad).

        Returns:
            ndarray float32 (N, 3) en escala normalizada.
        """
        import torch
        with torch.no_grad():
            t = torch.from_numpy(X).float()
            out = self._net(t)
        return out.numpy()


# ---------------------------------------------------------------------------
# API pública (misma interfaz que la versión Keras anterior)
# ---------------------------------------------------------------------------
def load_model() -> bool:
    """Carga el modelo BiLSTM v2 desde disco si aún no está en memoria.

    Devuelve True si el modelo está disponible al terminar la llamada,
    False si no se pudo cargar. No interrumpe el arranque de la API.
    """
    global _model

    if _model is not None:
        logger.info("Modelo ya cargado en memoria, se omite recarga.")
        return True

    if not _model_path.exists():
        logger.error(
            "No se encontró el modelo en %s. "
            "El backend arranca igualmente, pero los endpoints de predicción "
            "fallarán hasta que el archivo esté disponible.",
            _model_path,
        )
        return False

    try:
        import torch  # noqa: F401 — verificar que torch está instalado
    except ImportError:
        logger.exception(
            "PyTorch no está instalado. "
            "Instálalo con: pip install torch"
        )
        return False

    try:
        logger.info("Cargando modelo BiLSTM v2 desde %s ...", _model_path)
        net = BiLSTMv2()
        net.load_weights(_model_path)
        _model = net
        logger.info("Modelo BiLSTM v2 cargado correctamente — input (N, 12, 22) → output (N, 3)")
        return True
    except Exception:
        logger.exception("Error cargando el modelo desde %s", _model_path)
        _model = None
        return False


def get_model() -> Any:
    """Devuelve el modelo cargado en memoria.

    Lanza RuntimeError si el modelo no se ha cargado todavía.
    """
    if _model is None:
        raise RuntimeError(
            f"El modelo no está cargado. Verifica que existe {_model_path} "
            "y que load_model() se llamó durante el startup de la API."
        )
    return _model


def is_loaded() -> bool:
    """True si el modelo está disponible para inferencia."""
    return _model is not None

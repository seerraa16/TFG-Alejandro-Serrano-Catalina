"""Carga del modelo LSTM en memoria una sola vez al arrancar la API.

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
    # ... usar model.predict(...)
"""

from __future__ import annotations

import json
import logging
import zipfile
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# Estado interno del módulo. No se accede directamente desde fuera.
_model: Any = None
_model_path = settings.MODEL_LSTM

# Kwargs presentes en modelos guardados con Keras !=3.12 y que esta versión
# no acepta al deserializar. Se eliminan de la copia "compat" sin afectar
# a los pesos ni a la inferencia.
#   - renorm/* : kwargs legacy de BatchNormalization
#   - quantization_config : metadato de cuantización (Keras 3.13+)
#   - synchronized : flag de BatchNormalization (Keras 3.0+)
_DEPRECATED_KWARGS = {
    "renorm",
    "renorm_clipping",
    "renorm_momentum",
    "quantization_config",
}


def _strip_deprecated_kwargs(obj: Any) -> None:
    """Elimina recursivamente kwargs deprecados de un dict de config Keras."""
    if isinstance(obj, dict):
        for key in list(obj.keys()):
            if key in _DEPRECATED_KWARGS:
                obj.pop(key)
            else:
                _strip_deprecated_kwargs(obj[key])
    elif isinstance(obj, list):
        for item in obj:
            _strip_deprecated_kwargs(item)


def _ensure_compatible_keras_file(src: Path) -> Path:
    """Devuelve un .keras compatible con Keras 3.12, creándolo en cache si hace falta.

    Un archivo .keras es un zip con `config.json`, `metadata.json` y los pesos.
    Si el `config.json` contiene kwargs deprecados, generamos una copia limpia
    en `app/modelos/<nombre>.compat.keras` y la devolvemos.
    Si no contiene kwargs deprecados, devolvemos el original.
    """
    # Resolver symlinks para que el cache no dependa del nombre del enlace
    src_resolved = src.resolve()

    with zipfile.ZipFile(src_resolved) as zin:
        config_raw = zin.read("config.json")
    config = json.loads(config_raw)

    # Detectar si el config tiene kwargs deprecados
    serialized = json.dumps(config)
    if not any(k in serialized for k in _DEPRECATED_KWARGS):
        return src_resolved  # original ya válido

    # Generar copia limpia en app/modelos/
    cache_dir = settings.BACKEND_MODELOS_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    dst = cache_dir / f"{src_resolved.stem}.compat.keras"

    if dst.exists() and dst.stat().st_mtime >= src_resolved.stat().st_mtime:
        logger.info("Usando copia compat existente: %s", dst)
        return dst

    logger.info("Generando copia compat (sin kwargs deprecados) en %s ...", dst)
    _strip_deprecated_kwargs(config)
    with zipfile.ZipFile(src_resolved) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for name in zin.namelist():
            data = zin.read(name)
            if name == "config.json":
                data = json.dumps(config).encode("utf-8")
            zout.writestr(name, data)
    return dst


def load_model() -> bool:
    """Carga el modelo Keras desde disco si aún no está en memoria.

    Devuelve True si el modelo está disponible al terminar la llamada,
    False si no se pudo cargar (archivo no encontrado o error de Keras).
    Diseñado para no romper el arranque de la API: si falla, deja
    `_model = None` y los endpoints que llamen a `get_model()`
    recibirán un RuntimeError explícito.
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
        # Import perezoso: TensorFlow tarda en importar y puede no estar
        # instalado en entornos donde sólo se sirven endpoints sin modelo.
        from tensorflow.keras.models import load_model as keras_load_model
    except ImportError:
        logger.exception(
            "TensorFlow no está instalado. "
            "Instálalo con: pip install tensorflow"
        )
        return False

    try:
        path_to_load = _ensure_compatible_keras_file(_model_path)
        logger.info("Cargando modelo Keras desde %s ...", path_to_load)
        _model = keras_load_model(path_to_load, compile=False)
        logger.info(
            "Modelo cargado correctamente — input_shape=%s output_shape=%s",
            getattr(_model, "input_shape", "?"),
            getattr(_model, "output_shape", "?"),
        )
        return True
    except Exception:
        logger.exception("Error cargando el modelo desde %s", _model_path)
        _model = None
        return False


def get_model() -> Any:
    """Devuelve el modelo cargado en memoria.

    Lanza RuntimeError si el modelo no se ha cargado todavía
    (ej. el archivo no existía al arrancar, o se llama antes
    de inicializar el lifespan de FastAPI).
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

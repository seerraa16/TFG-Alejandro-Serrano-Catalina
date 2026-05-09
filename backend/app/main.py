"""Punto de entrada de la API FastAPI.

Ejecutar en local desde la carpeta `backend/`:

    uvicorn app.main:app --reload

Otras opciones útiles:

    uvicorn app.main:app --host 0.0.0.0 --port 8000        # exponer en red local
    uvicorn app.main:app --reload --log-level debug        # más verbosidad

Documentación interactiva:
    - Swagger UI -> http://localhost:8000/docs
    - ReDoc     -> http://localhost:8000/redoc
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.prediction import router as prediction_router
from app.core.config import settings
from app.models.model_loader import is_loaded, load_model

# Logging básico para toda la app. Los módulos usan logging.getLogger(__name__).
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ciclo de vida de la app: carga modelo al arrancar, libera al salir."""
    logger.info("Arrancando %s v%s", settings.APP_NAME, settings.APP_VERSION)
    load_model()
    yield
    logger.info("Cerrando aplicación.")


app = FastAPI(
    title=settings.APP_NAME,
    description="Backend del TFG de predicción de tráfico en la M30 de Madrid.",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS: permite que el frontend (que corre en otro dominio/puerto) llame a esta API.
# Para desarrollo se acepta cualquier origen. Antes de desplegar a producción
# restringe `allow_origins` a la URL real del frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(prediction_router)


@app.get("/debug/bpr")
def debug_bpr() -> dict:
    return {"alpha": settings.BPR_ALPHA, "beta": settings.BPR_BETA}


@app.get("/")
def root() -> dict:
    return {
        "name": "prediccion-trafico-api",
        "version": settings.APP_VERSION,
        "status": "ok",
        "docs": "/docs",
    }


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": is_loaded(),
    }

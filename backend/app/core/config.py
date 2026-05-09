"""Configuración global del backend.

Centraliza rutas y constantes reutilizables. Importar siempre desde aquí
en lugar de hardcodear paths en otros módulos:

    from app.core.config import settings
    df = pd.read_parquet(settings.PARQUET_TRAIN)

Las rutas se resuelven a partir de la ubicación de este archivo, por lo que
funcionan independientemente del directorio desde el que se arranque la app.
"""

from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Rutas base
# ---------------------------------------------------------------------------
# Este archivo vive en: backend/app/core/config.py
#   parents[0] = core/
#   parents[1] = app/
#   parents[2] = backend/
#   parents[3] = raíz del proyecto (donde están los notebooks, data/, outputs/...)
_THIS_FILE = Path(__file__).resolve()
BACKEND_DIR: Path = _THIS_FILE.parents[2]
PROJECT_ROOT: Path = _THIS_FILE.parents[3]


@dataclass(frozen=True)
class Settings:
    """Configuración inmutable del backend (paths + constantes)."""

    # --- Identidad de la API ---------------------------------------------
    APP_NAME: str = "Predicción de Tráfico M30 — API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # --- Rutas raíz ------------------------------------------------------
    PROJECT_ROOT: Path = PROJECT_ROOT
    BACKEND_DIR: Path = BACKEND_DIR

    # --- Datos / parquet -------------------------------------------------
    DATA_DIR: Path = PROJECT_ROOT / "data"
    PARQUET_TRAIN: Path = PROJECT_ROOT / "data" / "train.parquet"
    PARQUET_VAL: Path = PROJECT_ROOT / "data" / "val.parquet"
    PARQUET_TEST: Path = PROJECT_ROOT / "data" / "test.parquet"
    PARQUET_FE: Path = PROJECT_ROOT / "data" / "Trafico_fe.parquet"
    PARQUET_CLEAN: Path = PROJECT_ROOT / "data" / "Trafico_con_accidentes_clean.parquet"

    # --- Outputs (modelos entrenados, figuras, grafos generados) --------
    OUTPUTS_DIR: Path = PROJECT_ROOT / "outputs"

    # --- Modelos ---------------------------------------------------------
    # Carpeta del proyecto con scaler y modelos antiguos
    MODELS_DIR: Path = PROJECT_ROOT / "models"
    SCALER_PATH: Path = PROJECT_ROOT / "models" / "scaler.pkl"
    # Artefactos servidos directamente por el backend (copias específicas)
    BACKEND_MODELOS_DIR: Path = BACKEND_DIR / "app" / "modelos"

    # Pesos de los modelos DL ya entrenados en outputs/
    # MODEL_LSTM apunta al artefacto que servirá la API en producción.
    # IMPORTANTE: el pipeline de inferencia (scalers + perfiles + features)
    # espera arquitectura (4, 22) → 3 targets. Modelos compatibles:
    #   lstm_last.keras, exp1_lstm_deep_best.keras,
    #   exp2_gru_baseline_best.keras, exp3_gru_deep_best.keras
    # Cuando entrenes un nuevo lstm_best.keras con esa misma arquitectura,
    # cambia esta constante.
    MODEL_LSTM: Path = PROJECT_ROOT / "outputs" / "lstm_last.keras"
    MODEL_GRU: Path = PROJECT_ROOT / "outputs" / "best_GRU.keras"
    MODEL_RNN: Path = PROJECT_ROOT / "outputs" / "best_RNN.keras"
    MODEL_EXP1_LSTM_DEEP: Path = PROJECT_ROOT / "outputs" / "exp1_lstm_deep_best.keras"
    MODEL_EXP2_GRU_BASELINE: Path = PROJECT_ROOT / "outputs" / "exp2_gru_baseline_best.keras"
    MODEL_EXP3_GRU_DEEP: Path = PROJECT_ROOT / "outputs" / "exp3_gru_deep_best.keras"

    # --- Grafos ----------------------------------------------------------
    # Por convención los grafos se guardan también en outputs/
    GRAPHS_DIR: Path = PROJECT_ROOT / "outputs"
    # Grafo principal sobre red vial real (OSMnx) — el de referencia
    GRAPH_MAIN: Path = PROJECT_ROOT / "outputs" / "grafo_sensores_osm.graphml"
    GRAPH_SENSORES: Path = PROJECT_ROOT / "outputs" / "grafo_sensores.graphml"
    GRAPH_M30: Path = PROJECT_ROOT / "outputs" / "grafo_tipo_M30.graphml"
    GRAPH_URB: Path = PROJECT_ROOT / "outputs" / "grafo_tipo_URB.graphml"
    GRAPH_SENTIDO_A: Path = PROJECT_ROOT / "outputs" / "grafo_sentido_A.graphml"
    GRAPH_SENTIDO_B: Path = PROJECT_ROOT / "outputs" / "grafo_sentido_B.graphml"
    SENSORS_METADATA: Path = PROJECT_ROOT / "outputs" / "sensores_metadata.csv"

    # --- Cache -----------------------------------------------------------
    CACHE_DIR: Path = PROJECT_ROOT / "cache"

    # --- Hiperparámetros del modelo (compartidos con los notebooks) -----
    # No es lógica de inferencia, sólo constantes reutilizables.
    WINDOW: int = 12          # 12 timesteps de 15 min = 3h de historia
    HORIZON: int = 1          # +15 min hacia adelante
    BATCH_SIZE: int = 256
    TIMESTEPS_PER_DAY: int = 96   # 96 slots de 15 min en un día

    # --- Encoding tipo de sensor (mismo que en parquets/notebooks) ------
    TIPO_ELEM_M30: int = 1
    TIPO_ELEM_URB: int = 0

    # --- BPR (cálculo de tiempo de viaje) -------------------------------
    BPR_V_LIBRE_M30: float = 100.0  # km/h en autovía libre
    BPR_V_LIBRE_URB: float = 50.0   # km/h en viario urbano libre
    BPR_ALPHA: float = 1.0
    BPR_BETA: float = 2.0
    BPR_CAPACIDAD: int = 500        # vehículos / 15 min
    # Alias retrocompatible con la versión anterior del config
    BPR_V_LIBRE: float = 100.0

    # --- Routing (parámetros del grafo OSM) -----------------------------
    GRAPH_MIN_DIST_M: int = 30        # descarta carriles contrarios
    GRAPH_K_VECINOS: int = 3
    GRAPH_OSM_MARGIN: float = 0.015   # ~1.5 km de margen en bbox

    # --- Constantes físicas ---------------------------------------------
    EARTH_RADIUS_M: int = 6_371_000   # radio medio terrestre (m), para haversine

    # --- Caches de inferencia LSTM (generados por inferencia_app.ipynb) -
    INFERENCE_DIR: Path = PROJECT_ROOT / "outputs" / "inferencia"
    SCALER_X_INFERENCE: Path = PROJECT_ROOT / "outputs" / "inferencia" / "scaler_X_inference.pkl"
    SCALER_Y_INFERENCE: Path = PROJECT_ROOT / "outputs" / "inferencia" / "scaler_y_inference.pkl"
    HISTORICAL_PROFILES: Path = PROJECT_ROOT / "outputs" / "inferencia" / "historical_profiles.pkl"

    # --- Open-Meteo / weather -------------------------------------------
    WEATHER_DEFAULT_LAT: float = 40.4168           # Madrid centro
    WEATHER_DEFAULT_LON: float = -3.7038
    WEATHER_DEFAULT_TIMEZONE: str = "Europe/Madrid"
    WEATHER_DEFAULT_TIMEOUT_S: float = 15.0
    WEATHER_FORECAST_URL: str = "https://api.open-meteo.com/v1/forecast"
    WEATHER_ARCHIVE_URL: str = "https://archive-api.open-meteo.com/v1/archive"

    # --- Listas de paths para validación / iteración --------------------
    REQUIRED_PATHS: tuple = field(
        default=(
            "PROJECT_ROOT",
            "DATA_DIR",
            "OUTPUTS_DIR",
        )
    )


settings = Settings()


def missing_paths() -> list[Path]:
    """Devuelve los paths declarados que no existen en disco.

    Útil al arrancar la app para detectar configuraciones rotas
    (sin lanzar excepción: cada servicio decide si lo necesita).
    """
    missing = []
    for name in dir(settings):
        if name.startswith("_") or name.isupper() is False:
            continue
        value = getattr(settings, name)
        if isinstance(value, Path) and not value.exists():
            missing.append(value)
    return missing


__all__ = ["settings", "Settings", "BACKEND_DIR", "PROJECT_ROOT", "missing_paths"]

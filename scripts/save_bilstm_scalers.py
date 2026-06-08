"""Genera los artefactos de normalización del BiLSTM v2 para el backend.

Ejecuta este script UNA VEZ desde la raíz del proyecto con el entorno ssrr:

    python scripts/save_bilstm_scalers.py

Produce tres archivos en outputs/inferencia/:
    bilstm_X_mean.npy    — media de las 22 features (shape 22,)
    bilstm_X_std.npy     — desv. típica de las 22 features (shape 22,)
    bilstm_scaler_y.pkl  — StandardScaler ajustado en y_train (3 targets)

La lógica replica exactamente las celdas 4-9 del notebook Modelo2.0.ipynb
(misma ordenación de columnas, mismos ejes de reducción).
"""

import os
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]
TRAIN_PARQUET = ROOT / "data" / "train.parquet"
OUT_DIR = ROOT / "outputs" / "inferencia"

# Columnas del parquet (las mismas que usa el notebook)
LAG_COLS_BASE = ["intensidad_trafico", "ocupacion", "carga"]
CONTEXT_COLS = [
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
]
SEQ_LEN = 12
TARGET_COLS = ["intensidad_trafico", "ocupacion", "carga"]


def main() -> None:
    if not TRAIN_PARQUET.exists():
        sys.exit(f"ERROR: no se encontró {TRAIN_PARQUET}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Leyendo {TRAIN_PARQUET} ...")
    df = pd.read_parquet(TRAIN_PARQUET)

    # -----------------------------------------------------------------------
    # Construir lag_train (N, 12, 3) y ctx_train (N, 19)
    # -----------------------------------------------------------------------
    lag_cols = [f"{base}_lag{k}" for k in range(1, SEQ_LEN + 1)
                for base in LAG_COLS_BASE]

    missing = [c for c in lag_cols + CONTEXT_COLS + TARGET_COLS if c not in df.columns]
    if missing:
        sys.exit(f"ERROR: columnas faltantes en el parquet: {missing[:5]} ...")

    N = len(df)
    lag_train = df[lag_cols].values.astype("float32").reshape(N, SEQ_LEN, 3)
    ctx_train = df[CONTEXT_COLS].values.astype("float32")
    y_train = df[TARGET_COLS].values.astype("float32")

    # -----------------------------------------------------------------------
    # Estadísticos de normalización (idénticos a celda 9 de Modelo2.0.ipynb)
    # -----------------------------------------------------------------------
    N_FEATURES = 3 + len(CONTEXT_COLS)  # 22
    mean_ = np.empty(N_FEATURES, dtype="float32")
    std_ = np.empty(N_FEATURES, dtype="float32")

    mean_[:3] = lag_train.mean(axis=(0, 1))     # media global de los 3 targets de lag
    std_[:3] = lag_train.std(axis=(0, 1))       # std poblacional (ddof=0)
    mean_[3:] = ctx_train.mean(axis=0)          # por columna de contexto
    std_[3:] = ctx_train.std(axis=0)
    std_ = np.where(std_ == 0, 1.0, std_).astype("float32")

    scaler_y = StandardScaler()
    scaler_y.fit(y_train)

    # -----------------------------------------------------------------------
    # Guardar
    # -----------------------------------------------------------------------
    np.save(str(OUT_DIR / "bilstm_X_mean.npy"), mean_)
    np.save(str(OUT_DIR / "bilstm_X_std.npy"), std_)
    with open(OUT_DIR / "bilstm_scaler_y.pkl", "wb") as f:
        pickle.dump(scaler_y, f)

    print(f"Guardado en {OUT_DIR}/")
    print(f"  bilstm_X_mean.npy  shape={mean_.shape}  mean[:3]={np.round(mean_[:3], 3)}")
    print(f"  bilstm_X_std.npy   shape={std_.shape}")
    print(f"  bilstm_scaler_y.pkl  mean={np.round(scaler_y.mean_, 3)}")
    print("\nListo. Ahora puedes arrancar el backend con el modelo BiLSTM v2.")


if __name__ == "__main__":
    main()

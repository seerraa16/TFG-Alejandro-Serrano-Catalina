#!/usr/bin/env python
"""
Evaluación del modelo LSTM sobre datos de test.

Ejecutar desde la raíz del proyecto con el entorno conda:
    conda run -n ssrr python backend/scripts/evaluate_model.py
    conda run -n ssrr python backend/scripts/evaluate_model.py --samples 5000

Requiere en disco:
    data/test.parquet
    outputs/lstm_last.keras
    outputs/inferencia/scaler_X_inference.pkl
    outputs/inferencia/scaler_y_inference.pkl
    outputs/inferencia/historical_profiles.pkl

Genera en outputs/:
    eval_metrics.txt                métricas globales (MAE, RMSE, R²) por target
    eval_mae_por_hora.png           MAE de intensidad por hora del día (0-23)
    eval_mae_por_tipo.png           MAE por tipo de sensor (M30 vs URB)
    eval_residuos.png               distribución de residuos (pred − real) por target
    eval_scatter_intensidad.png     predicted vs actual (intensidad_trafico)
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")  # sin GUI, compatible con entornos sin pantalla
import matplotlib.pyplot as plt
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# ── sys.path para importar el backend ─────────────────────────────────────────
_HERE    = Path(__file__).resolve()
_BACKEND = _HERE.parents[1]   # backend/
sys.path.insert(0, str(_BACKEND))

# ── imports del backend (después de ajustar sys.path) ─────────────────────────
from app.core.config import settings                                    # noqa: E402
from app.models.model_loader import load_model, get_model               # noqa: E402
from app.prediction.data_cache import preload_all, get_scaler_x, get_scaler_y  # noqa: E402
from app.prediction.feature_builder import (                            # noqa: E402
    build_features_anytime, build_sequences, TARGET_COLS,
)
from app.routing.graph_loader import get_tipo_elem_int                  # noqa: E402

logging.basicConfig(level=logging.WARNING)

# ── constantes ────────────────────────────────────────────────────────────────
# Nombres de columna en test.parquet → nombres de columna en la salida
TARGETS_IN  = ["intensidad_trafico", "ocupacion", "carga"]
TARGETS_OUT = ["intensidad", "ocupacion", "carga"]   # columnas de predicción
N_SAMPLES_DEFAULT = 2000


# ── detección defensiva de columnas ───────────────────────────────────────────
def _find_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _require_col(df: pd.DataFrame, candidates: list[str], label: str) -> str:
    col = _find_col(df, candidates)
    if col is None:
        raise KeyError(
            f"Columna {label!r} no encontrada en test.parquet.\n"
            f"  Probadas: {candidates}\n"
            f"  Columnas disponibles: {list(df.columns)}"
        )
    return col


# ── carga y muestreo de test.parquet ─────────────────────────────────────────
def load_test(n_samples: int) -> pd.DataFrame:
    path = settings.PARQUET_TEST
    if not path.exists():
        print(
            f"\n[ERROR] No se encontró {path}\n"
            "El archivo data/test.parquet no está en el repositorio (está en .gitignore).\n"
            "Genera los splits ejecutando el notebook de preprocesado o copia el archivo a data/."
        )
        sys.exit(1)

    print(f"  Leyendo {path} ...", end=" ", flush=True)
    df = pd.read_parquet(path)
    print(f"{len(df):,} filas")

    # Detectar columnas necesarias
    col_id   = _require_col(df, ["id", "id_elem", "sensor_id"],          "sensor_id")
    col_ts   = _require_col(df, ["fecha", "timestamp", "datetime", "fecha_hora"], "timestamp")
    col_tipo = _require_col(df, ["tipo_elem", "tipo"],                   "tipo_elem")

    for t in TARGETS_IN:
        if t not in df.columns:
            raise KeyError(
                f"Columna target {t!r} no encontrada.\n"
                f"Columnas disponibles: {list(df.columns)}"
            )

    # Normalizar nombres a los que usa el resto del script
    rename = {
        col for col in [col_id, col_ts, col_tipo]
        if col != {"id": col_id, "fecha": col_ts, "tipo_elem": col_tipo}.get(
            {"id": "id", "fecha": "fecha", "tipo_elem": "tipo_elem"}.get(col, col)
        )
    }
    col_map = {}
    if col_id   != "id":        col_map[col_id]   = "id"
    if col_ts   != "fecha":     col_map[col_ts]   = "fecha"
    if col_tipo != "tipo_elem": col_map[col_tipo] = "tipo_elem"
    if col_map:
        df = df.rename(columns=col_map)

    df["fecha"] = pd.to_datetime(df["fecha"])

    # Muestreo estratificado por hora → cobertura uniforme de todo el día
    df["_hora"] = df["fecha"].dt.hour
    per_hora = max(1, n_samples // 24)
    sampled = (
        df.groupby("_hora", group_keys=False)
          .apply(lambda g: g.sample(min(per_hora, len(g)), random_state=42))
    )
    sampled = sampled.sample(min(n_samples, len(sampled)), random_state=42).reset_index(drop=True)
    sampled = sampled.drop(columns=["_hora"])

    print(f"  Muestra seleccionada: {len(sampled):,} filas "
          f"(~{len(sampled) // 24} por hora)")
    return sampled


# ── inferencia por lotes ──────────────────────────────────────────────────────
def run_inference(df: pd.DataFrame) -> pd.DataFrame:
    model    = get_model()
    scaler_x = get_scaler_x()
    scaler_y = get_scaler_y()
    tipo_map = get_tipo_elem_int()

    has_lluvia = "lluvia_ord" in df.columns
    has_precip = "precip_mm"  in df.columns

    rows: list[dict] = []
    valid_idx: list[int] = []
    n_skipped = 0

    for i, row in enumerate(df.itertuples(index=False)):
        sid    = int(row.id)
        ts     = row.fecha
        tipo   = tipo_map.get(sid, int(row.tipo_elem))
        weather = {
            "lluvia_ord": int(row.lluvia_ord)  if has_lluvia else 0,
            "precip_mm":  float(row.precip_mm) if has_precip else 0.0,
        }
        try:
            feat = build_features_anytime(sid, ts, weather, tipo)
        except Exception:
            n_skipped += 1
            continue
        rows.append(feat)
        valid_idx.append(i)

    if not rows:
        print("[ERROR] No se pudieron construir features para ninguna fila.")
        sys.exit(1)

    if n_skipped:
        print(f"  Filas omitidas (sin perfil): {n_skipped}")

    df_feat = pd.DataFrame(rows)
    X   = build_sequences(df_feat)                                   # (N, 4, 22)
    X_n = scaler_x.transform(X.reshape(-1, X.shape[-1])).reshape(X.shape)
    y_n = model.predict(X_n, verbose=0)                              # (N, 3)
    y   = scaler_y.inverse_transform(y_n)                            # escala original

    pred_df = pd.DataFrame(y, columns=TARGETS_OUT, index=valid_idx)

    gt = (
        df.loc[valid_idx, ["id", "fecha", "tipo_elem"] + TARGETS_IN]
          .reset_index(drop=True)
    )
    result = pd.concat([gt, pred_df.reset_index(drop=True).add_suffix("_pred")], axis=1)
    return result


# ── métricas ──────────────────────────────────────────────────────────────────
def compute_metrics(result: pd.DataFrame) -> dict:
    metrics = {}
    for real_col, pred_col in zip(TARGETS_IN, [f"{t}_pred" for t in TARGETS_OUT]):
        y_true = result[real_col].values
        y_pred = result[pred_col].values
        mask = np.isfinite(y_true) & np.isfinite(y_pred)
        y_true, y_pred = y_true[mask], y_pred[mask]
        metrics[real_col] = {
            "MAE":  mean_absolute_error(y_true, y_pred),
            "RMSE": np.sqrt(mean_squared_error(y_true, y_pred)),
            "R²":   r2_score(y_true, y_pred),
            "n":    int(mask.sum()),
        }
    return metrics


def print_and_save_metrics(metrics: dict, out_dir: Path) -> None:
    sep = "=" * 54
    hdr = f"{'Target':<24} {'MAE':>8} {'RMSE':>8} {'R²':>7} {'N':>6}"
    lines = [sep, hdr, "-" * 54]
    for tgt, m in metrics.items():
        lines.append(
            f"{tgt:<24} {m['MAE']:>8.3f} {m['RMSE']:>8.3f} {m['R²']:>7.4f} {m['n']:>6,}"
        )
    lines.append(sep)
    text = "\n".join(lines)
    print("\n" + text)
    (out_dir / "eval_metrics.txt").write_text(text + "\n", encoding="utf-8")
    print(f"  → {out_dir / 'eval_metrics.txt'}")


# ── gráfica 1: MAE por hora del día ──────────────────────────────────────────
def plot_mae_por_hora(result: pd.DataFrame, out_dir: Path) -> None:
    df = result.copy()
    df["hora"] = pd.to_datetime(df["fecha"]).dt.hour
    df["err_abs"] = (df["intensidad_trafico"] - df["intensidad_pred"]).abs()
    mae_hora = df.groupby("hora")["err_abs"].mean()

    fig, ax = plt.subplots(figsize=(11, 4))
    ax.bar(mae_hora.index, mae_hora.values, color="#2563eb", alpha=0.85, width=0.7)
    ax.axhline(mae_hora.mean(), color="#dc2626", linestyle="--", linewidth=1.3,
               label=f"Media global: {mae_hora.mean():.1f} veh/15min")
    ax.set_xlabel("Hora del día", fontsize=11)
    ax.set_ylabel("MAE intensidad (veh/15 min)", fontsize=11)
    ax.set_title("Error medio absoluto de intensidad por hora del día", fontsize=13)
    ax.set_xticks(range(0, 24))
    ax.legend(fontsize=9)
    ax.grid(axis="y", alpha=0.3)
    plt.tight_layout()
    fig.savefig(out_dir / "eval_mae_por_hora.png", dpi=130)
    plt.close(fig)
    print(f"  → eval_mae_por_hora.png")


# ── gráfica 2: MAE por tipo de sensor ────────────────────────────────────────
def plot_mae_por_tipo(result: pd.DataFrame, out_dir: Path) -> None:
    tipo_labels = {0: "URB\n(urbano)", 1: "M30\n(autovía)"}
    grupos: dict[str, dict] = {}
    for tipo_val, label in tipo_labels.items():
        sub = result[result["tipo_elem"] == tipo_val]
        if sub.empty:
            continue
        residuos = sub["intensidad_trafico"] - sub["intensidad_pred"]
        grupos[label] = {
            "MAE":  residuos.abs().mean(),
            "RMSE": np.sqrt((residuos ** 2).mean()),
        }
    if not grupos:
        return

    labels = list(grupos.keys())
    maes   = [grupos[l]["MAE"]  for l in labels]
    rmses  = [grupos[l]["RMSE"] for l in labels]
    x = np.arange(len(labels))
    w = 0.35

    fig, ax = plt.subplots(figsize=(6, 4))
    ax.bar(x - w / 2, maes,  w, label="MAE",  color="#2563eb", alpha=0.85)
    ax.bar(x + w / 2, rmses, w, label="RMSE", color="#16a34a", alpha=0.85)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=11)
    ax.set_ylabel("Error (veh/15 min)", fontsize=11)
    ax.set_title("MAE y RMSE de intensidad por tipo de sensor", fontsize=13)
    ax.legend(fontsize=9)
    ax.grid(axis="y", alpha=0.3)
    plt.tight_layout()
    fig.savefig(out_dir / "eval_mae_por_tipo.png", dpi=130)
    plt.close(fig)
    print(f"  → eval_mae_por_tipo.png")


# ── gráfica 3: distribución de residuos ──────────────────────────────────────
def plot_residuos(result: pd.DataFrame, out_dir: Path) -> None:
    titulos = ["Intensidad (veh/15 min)", "Ocupación (%)", "Carga (%)"]
    fig, axes = plt.subplots(1, 3, figsize=(14, 4))

    for ax, real_col, pred_col, titulo in zip(
        axes,
        TARGETS_IN,
        [f"{t}_pred" for t in TARGETS_OUT],
        titulos,
    ):
        res = (result[pred_col] - result[real_col]).dropna()
        ax.hist(res, bins=60, color="#2563eb", alpha=0.82, edgecolor="white", linewidth=0.2)
        ax.axvline(0, color="#dc2626", linewidth=1.5, linestyle="--", label="Error = 0")
        ax.axvline(res.mean(), color="#d97706", linewidth=1.2, linestyle=":",
                   label=f"Media: {res.mean():.2f}")
        ax.set_title(titulo, fontsize=11)
        ax.set_xlabel("Residuo (pred − real)", fontsize=9)
        ax.set_ylabel("Frecuencia", fontsize=9)
        ax.legend(fontsize=8)
        ax.grid(alpha=0.2)

    plt.suptitle("Distribución de residuos por target", fontsize=13, y=1.02)
    plt.tight_layout()
    fig.savefig(out_dir / "eval_residuos.png", dpi=130, bbox_inches="tight")
    plt.close(fig)
    print(f"  → eval_residuos.png")


# ── gráfica 4: scatter predicted vs actual ───────────────────────────────────
def plot_scatter(result: pd.DataFrame, out_dir: Path) -> None:
    x = result["intensidad_trafico"].values
    y = result["intensidad_pred"].values
    mask = np.isfinite(x) & np.isfinite(y)
    x, y = x[mask], y[mask]

    lim = max(x.max(), y.max()) * 1.05
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.scatter(x, y, alpha=0.20, s=7, color="#2563eb", rasterized=True)
    ax.plot([0, lim], [0, lim], "r--", linewidth=1.3, label="Predicción perfecta")
    ax.set_xlim(0, lim)
    ax.set_ylim(0, lim)
    ax.set_xlabel("Intensidad real (veh/15 min)", fontsize=11)
    ax.set_ylabel("Intensidad predicha (veh/15 min)", fontsize=11)
    ax.set_title("Predicted vs. Actual — intensidad de tráfico", fontsize=13)
    ax.legend(fontsize=9)
    ax.grid(alpha=0.2)
    plt.tight_layout()
    fig.savefig(out_dir / "eval_scatter_intensidad.png", dpi=130)
    plt.close(fig)
    print(f"  → eval_scatter_intensidad.png")


# ── main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evalúa el modelo LSTM en producción sobre datos de test."
    )
    parser.add_argument(
        "--samples", type=int, default=N_SAMPLES_DEFAULT,
        help=f"Filas a evaluar, distribuidas uniformemente por hora (default: {N_SAMPLES_DEFAULT})",
    )
    args = parser.parse_args()

    out_dir = settings.OUTPUTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 54)
    print("  Evaluacion del modelo LSTM")
    print(f"  Modelo:   {settings.MODEL_LSTM.name}")
    print(f"  Muestras: {args.samples}")
    print(f"  Salidas:  {out_dir}/eval_*")
    print("=" * 54)
    print()

    # 1) Cargar artefactos
    print("[1/4] Cargando modelo y caches...")
    if not load_model():
        print(f"[ERROR] No se pudo cargar el modelo desde {settings.MODEL_LSTM}")
        sys.exit(1)
    preload_all()
    print("  OK\n")

    # 2) Datos de test
    print("[2/4] Cargando datos de test...")
    df = load_test(args.samples)
    print()

    # 3) Inferencia
    print("[3/4] Ejecutando inferencia...")
    result = run_inference(df)
    print(f"  Filas evaluadas: {len(result):,}\n")

    # 4) Métricas y gráficas
    print("[4/4] Calculando métricas y generando gráficas...")
    metrics = compute_metrics(result)
    print_and_save_metrics(metrics, out_dir)
    plot_mae_por_hora(result, out_dir)
    plot_mae_por_tipo(result, out_dir)
    plot_residuos(result, out_dir)
    plot_scatter(result, out_dir)

    print("\nEvaluacion completada. Revisa outputs/eval_*")


if __name__ == "__main__":
    main()

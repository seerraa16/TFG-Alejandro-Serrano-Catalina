"""
Validacion de ETA del sistema contra referencia externa (Google / Apple Maps).

Uso:
    python scripts/validacion_eta.py
    python scripts/validacion_eta.py --input scripts/rutas_test.csv

CSV de ENTRADA (columnas requeridas):
    ruta              - nombre descriptivo de la ruta
    origen_lat        - latitud del punto de origen
    origen_lon        - longitud del punto de origen
    destino_lat       - latitud del destino
    destino_lon       - longitud del destino
    datetime          - fecha/hora ISO 8601  (ej. 2026-06-04T09:00:00)
    eta_google_min    - ETA de referencia en minutos (dejar en blanco para rellenar despues)

CSV de SALIDA  outputs/validacion_eta/resultados.csv:
    ruta, datetime, eta_sistema_min, eta_google_min, error_abs_min
"""

import argparse
import sys
import time
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT  = ROOT / "scripts" / "rutas_test.csv"
DEFAULT_OUTPUT = ROOT / "outputs" / "validacion_eta" / "resultados.csv"
API_BASE       = "http://localhost:8000"
NOMINATIM_URL  = "https://nominatim.openstreetmap.org/reverse"
_geo_cache: dict = {}


def reverse_geocode(lat: float, lon: float) -> str:
    """Convierte lat/lon en una direccion de texto via Nominatim."""
    key = (round(lat, 5), round(lon, 5))
    if key in _geo_cache:
        return _geo_cache[key]
    r = requests.get(
        NOMINATIM_URL,
        params={"lat": lat, "lon": lon, "format": "json", "zoom": 16},
        headers={"User-Agent": "validacion_eta_tfg/1.0"},
        timeout=10,
    )
    r.raise_for_status()
    address = r.json().get("display_name", f"{lat},{lon}")
    _geo_cache[key] = address
    return address


def call_predict(origin: str, destination: str, dt: str) -> dict:
    r = requests.post(
        f"{API_BASE}/predict",
        json={"origin": origin, "destination": destination,
              "datetime": dt, "mode": "osm", "use_traffic_signals": True},
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input",  default=str(DEFAULT_INPUT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()

    df = pd.read_csv(args.input)

    needed = {"origen_lat", "origen_lon", "destino_lat", "destino_lon", "datetime"}
    missing = needed - set(df.columns)
    if missing:
        print(f"ERROR: faltan columnas en el CSV: {missing}")
        sys.exit(1)

    if "ruta" not in df.columns:
        df["ruta"] = [f"ruta_{i+1}" for i in range(len(df))]
    if "eta_google_min" not in df.columns:
        df["eta_google_min"] = None

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    results = []
    for _, row in df.iterrows():
        print(f"  {row['ruta']} ...", end=" ", flush=True)
        try:
            origen  = reverse_geocode(float(row["origen_lat"]),  float(row["origen_lon"]))
            destino = reverse_geocode(float(row["destino_lat"]), float(row["destino_lon"]))
            data    = call_predict(origen, destino, str(row["datetime"]))
            eta_sis = round(data["eta_minutes"], 1)
            ref     = float(row["eta_google_min"]) if pd.notna(row["eta_google_min"]) else None
            err     = round(abs(eta_sis - ref), 1) if ref is not None else ""
            print(f"{eta_sis} min  (ref: {ref if ref else '-'} | err: {err if err != '' else '-'})")
            results.append({
                "ruta":            row["ruta"],
                "datetime":        row["datetime"],
                "eta_sistema_min": eta_sis,
                "eta_google_min":  ref if ref is not None else "",
                "error_abs_min":   err,
            })
        except Exception as e:
            print(f"ERROR -> {e}")
            results.append({
                "ruta":            row["ruta"],
                "datetime":        row["datetime"],
                "eta_sistema_min": "ERROR",
                "eta_google_min":  "",
                "error_abs_min":   "",
            })

    out = pd.DataFrame(results)
    out.to_csv(args.output, index=False)
    print(f"\nGuardado en {args.output}")

    validos = out[out["eta_sistema_min"] != "ERROR"]
    con_ref = validos[validos["error_abs_min"] != ""]
    if not con_ref.empty:
        mae = con_ref["error_abs_min"].astype(float).mean()
        print(f"MAE sobre {len(con_ref)} rutas con referencia: {mae:.1f} min")


if __name__ == "__main__":
    main()

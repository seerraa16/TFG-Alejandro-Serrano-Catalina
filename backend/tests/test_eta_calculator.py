"""Tests unitarios de eta_calculator.py.

No requieren modelo ni disco. Comprueban la lógica del modelo BPR
y el cálculo de ETA por tramos.
"""

import pandas as pd
import pytest

from app.eta.eta_calculator import compute_eta, vmed_from_predictions
from app.core.config import settings

TIPO_M30 = settings.TIPO_ELEM_M30
TIPO_URB = settings.TIPO_ELEM_URB


# ---------------------------------------------------------------------------
# vmed_from_predictions
# ---------------------------------------------------------------------------
class TestVmedFromPredictions:
    def test_tráfico_libre_m30_cerca_v_libre(self):
        v = vmed_from_predictions(
            intensidad=0.0, ocupacion=0.0, carga=0.0, tipo_elem=TIPO_M30
        )
        assert v == pytest.approx(settings.BPR_V_LIBRE_M30, rel=0.05)

    def test_tráfico_libre_urb_cerca_v_libre(self):
        v = vmed_from_predictions(
            intensidad=0.0, ocupacion=0.0, carga=0.0, tipo_elem=TIPO_URB
        )
        assert v == pytest.approx(settings.BPR_V_LIBRE_URB, rel=0.05)

    def test_congestión_alta_reduce_velocidad(self):
        v_libre = vmed_from_predictions(
            intensidad=0.0, ocupacion=0.0, carga=0.0, tipo_elem=TIPO_M30
        )
        v_congestion = vmed_from_predictions(
            intensidad=800.0, ocupacion=80.0, carga=90.0, tipo_elem=TIPO_M30
        )
        assert v_congestion < v_libre

    def test_velocidad_minima_m30(self):
        v = vmed_from_predictions(
            intensidad=9999.0, ocupacion=100.0, carga=100.0, tipo_elem=TIPO_M30
        )
        assert v >= 20.0

    def test_velocidad_minima_urb(self):
        v = vmed_from_predictions(
            intensidad=9999.0, ocupacion=100.0, carga=100.0, tipo_elem=TIPO_URB
        )
        assert v >= 10.0

    def test_v_libre_override_respetada(self):
        v = vmed_from_predictions(
            intensidad=0.0, ocupacion=0.0, carga=0.0,
            tipo_elem=TIPO_M30, v_libre_override=80.0
        )
        assert v == pytest.approx(80.0, rel=0.05)

    def test_velocidad_no_supera_v_libre(self):
        v = vmed_from_predictions(
            intensidad=0.0, ocupacion=0.0, carga=0.0, tipo_elem=TIPO_M30
        )
        assert v <= settings.BPR_V_LIBRE_M30


# ---------------------------------------------------------------------------
# compute_eta
# ---------------------------------------------------------------------------
def _make_predictions(sensor_ids, intensidad=50.0, ocupacion=20.0, carga=30.0):
    return pd.DataFrame(
        {"intensidad": intensidad, "ocupacion": ocupacion, "carga": carga},
        index=sensor_ids,
    )


class TestComputeEta:
    def test_sin_predicciones_devuelve_error(self):
        result = compute_eta(
            sensor_ids=[1, 2],
            distancias_m=[500.0],
            predictions_df=None,
            tipo_elem_int={},
        )
        assert "error" in result

    def test_predicciones_vacías_devuelve_error(self):
        result = compute_eta(
            sensor_ids=[1, 2],
            distancias_m=[500.0],
            predictions_df=pd.DataFrame(),
            tipo_elem_int={},
        )
        assert "error" in result

    def test_resultado_contiene_campos_esperados(self):
        preds = _make_predictions([1, 2])
        result = compute_eta(
            sensor_ids=[1, 2],
            distancias_m=[1000.0],
            predictions_df=preds,
            tipo_elem_int={1: TIPO_M30, 2: TIPO_M30},
        )
        assert "tiempo_total_s" in result
        assert "tiempo_total_min" in result
        assert "distancia_total_m" in result
        assert "tramos" in result

    def test_tiempo_total_positivo(self):
        preds = _make_predictions([1, 2])
        result = compute_eta(
            sensor_ids=[1, 2],
            distancias_m=[1000.0],
            predictions_df=preds,
            tipo_elem_int={1: TIPO_URB, 2: TIPO_URB},
        )
        assert result["tiempo_total_s"] > 0
        assert result["tiempo_total_min"] > 0

    def test_mas_congestión_implica_mas_tiempo(self):
        preds_libre = _make_predictions([1, 2], intensidad=0, ocupacion=0, carga=0)
        preds_cong  = _make_predictions([1, 2], intensidad=800, ocupacion=80, carga=90)
        kwargs = dict(
            sensor_ids=[1, 2],
            distancias_m=[2000.0],
            tipo_elem_int={1: TIPO_M30, 2: TIPO_M30},
        )
        t_libre = compute_eta(predictions_df=preds_libre, **kwargs)["tiempo_total_s"]
        t_cong  = compute_eta(predictions_df=preds_cong,  **kwargs)["tiempo_total_s"]
        assert t_cong > t_libre

    def test_distancia_total_correcta(self):
        preds = _make_predictions([1, 2, 3])
        result = compute_eta(
            sensor_ids=[1, 2, 3],
            distancias_m=[500.0, 800.0],
            predictions_df=preds,
            tipo_elem_int={1: TIPO_URB, 2: TIPO_URB, 3: TIPO_URB},
        )
        assert result["distancia_total_m"] == pytest.approx(1300.0)

    def test_un_solo_sensor_no_genera_tramos(self):
        preds = _make_predictions([1])
        result = compute_eta(
            sensor_ids=[1],
            distancias_m=[],
            predictions_df=preds,
            tipo_elem_int={1: TIPO_M30},
        )
        assert result.get("tramos", []) == []

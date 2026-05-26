"""Tests unitarios de feature_builder.py.

No requieren modelo ni datos en disco: se mockea get_profile_idx
para devolver perfiles conocidos y se comprueba que las features
generadas tienen la estructura y rangos correctos.
"""

import math
from datetime import datetime
from unittest.mock import patch

import pytest

from app.prediction.feature_builder import (
    N_FEATURES,
    SEQ_LEN,
    build_features_anytime,
    build_sequences,
)

# Perfil ficticio que devuelve el mock de get_profile_idx
_FAKE_PROFILE = {"intensidad": 100.0, "ocupacion": 20.0, "carga": 30.0}
_FAKE_IDX = {}  # el mock ignora la clave y devuelve _FAKE_PROFILE


def _build(dt_str, weather=None, accidente=False, tipo_elem=1):
    weather = weather or {"lluvia_ord": 0, "precip_mm": 0.0}
    with patch("app.prediction.feature_builder.get_profile_idx", return_value=_FAKE_IDX):
        with patch(
            "app.prediction.feature_builder._profile_lookup",
            return_value=_FAKE_PROFILE,
        ):
            return build_features_anytime(
                sensor_id=1234,
                dt=dt_str,
                weather=weather,
                tipo_elem=tipo_elem,
                accidente=accidente,
            )


# ---------------------------------------------------------------------------
# Estructura
# ---------------------------------------------------------------------------
class TestBuildFeaturesStructure:
    def test_returns_dict(self):
        feat = _build("2024-06-10 08:00:00")
        assert isinstance(feat, dict)

    def test_expected_number_of_keys(self):
        feat = _build("2024-06-10 08:00:00")
        # 3 lags × 4 steps  +  19 context = 12 + 10 + ... ver N_FEATURES
        # La función devuelve el dict PLANO (no el tensor); contamos las
        # columnas que luego irán al tensor: 3×4 lags + 6 rolling + 13 context
        expected_keys = {
            "intensidad_trafico_lag1", "intensidad_trafico_lag2",
            "intensidad_trafico_lag3", "intensidad_trafico_lag4",
            "ocupacion_lag1", "ocupacion_lag2", "ocupacion_lag3", "ocupacion_lag4",
            "carga_lag1", "carga_lag2", "carga_lag3", "carga_lag4",
            "intensidad_trafico_roll4", "intensidad_trafico_roll8",
            "ocupacion_roll4", "ocupacion_roll8",
            "carga_roll4", "carga_roll8",
            "slot_sin", "slot_cos",
            "dia_sem_sin", "dia_sem_cos",
            "mes_sin", "mes_cos",
            "es_laborable",
            "lluvia_ord", "precip_mm",
            "hay_accidente", "accidente_reciente_1h", "tiempo_accidente_norm",
            "tipo_elem",
        }
        assert expected_keys == set(feat.keys())


# ---------------------------------------------------------------------------
# Flags temporales
# ---------------------------------------------------------------------------
class TestTemporalFlags:
    def test_laborable_weekday(self):
        feat = _build("2024-06-10 08:00:00")  # lunes
        assert feat["es_laborable"] == 1

    def test_no_laborable_saturday(self):
        feat = _build("2024-06-08 08:00:00")  # sábado
        assert feat["es_laborable"] == 0

    def test_no_laborable_sunday(self):
        feat = _build("2024-06-09 08:00:00")  # domingo
        assert feat["es_laborable"] == 0

    def test_cyclical_slot_in_range(self):
        feat = _build("2024-06-10 08:00:00")
        assert -1.0 <= feat["slot_sin"] <= 1.0
        assert -1.0 <= feat["slot_cos"] <= 1.0

    def test_cyclical_day_in_range(self):
        feat = _build("2024-06-10 08:00:00")
        assert -1.0 <= feat["dia_sem_sin"] <= 1.0
        assert -1.0 <= feat["dia_sem_cos"] <= 1.0

    def test_cyclical_month_in_range(self):
        feat = _build("2024-06-10 08:00:00")
        assert -1.0 <= feat["mes_sin"] <= 1.0
        assert -1.0 <= feat["mes_cos"] <= 1.0


# ---------------------------------------------------------------------------
# Accidente
# ---------------------------------------------------------------------------
class TestAccidenteFlag:
    def test_sin_accidente(self):
        feat = _build("2024-06-10 08:00:00", accidente=False)
        assert feat["hay_accidente"] == 0
        assert feat["accidente_reciente_1h"] == 0
        assert feat["tiempo_accidente_norm"] == 0.0

    def test_con_accidente(self):
        feat = _build("2024-06-10 08:00:00", accidente=True)
        assert feat["hay_accidente"] == 1
        assert feat["accidente_reciente_1h"] == 1
        assert feat["tiempo_accidente_norm"] == 0.5


# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------
class TestWeatherFeatures:
    def test_lluvia_ord_propagada(self):
        feat = _build("2024-06-10 08:00:00", weather={"lluvia_ord": 2, "precip_mm": 5.0})
        assert feat["lluvia_ord"] == 2
        assert feat["precip_mm"] == pytest.approx(5.0)

    def test_lluvia_ord_defecto_cero(self):
        feat = _build("2024-06-10 08:00:00", weather={})
        assert feat["lluvia_ord"] == 0
        assert feat["precip_mm"] == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# Perfiles (rolling means)
# ---------------------------------------------------------------------------
class TestRollingMeans:
    def test_rolling_equals_profile_when_uniform(self):
        feat = _build("2024-06-10 08:00:00")
        # Si todos los lags tienen el mismo perfil, la media debe ser igual
        assert feat["intensidad_trafico_roll4"] == pytest.approx(_FAKE_PROFILE["intensidad"])
        assert feat["ocupacion_roll4"] == pytest.approx(_FAKE_PROFILE["ocupacion"])
        assert feat["carga_roll4"] == pytest.approx(_FAKE_PROFILE["carga"])

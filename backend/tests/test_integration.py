"""Tests de integración — pipeline real con modelo cargado.

Se saltan automáticamente si los artefactos no están en disco
(outputs/*.keras, outputs/inferencia/*.pkl). Para ejecutarlos:

    cd backend
    conda run -n ssrr pytest tests/test_integration.py -v

O desde la raíz:
    conda run -n ssrr pytest backend/tests/test_integration.py -v
"""

from __future__ import annotations

import pytest


# ── skip si los artefactos no están disponibles ───────────────────────────────
def _artifacts_available() -> bool:
    try:
        from app.core.config import settings
        return (
            settings.MODEL_LSTM.exists()
            and settings.SCALER_X_INFERENCE.exists()
            and settings.SCALER_Y_INFERENCE.exists()
            and settings.HISTORICAL_PROFILES.exists()
        )
    except Exception:
        return False


needs_model = pytest.mark.skipif(
    not _artifacts_available(),
    reason=(
        "Artefactos del modelo no disponibles. "
        "Asegúrate de que existen: outputs/lstm_last.keras y outputs/inferencia/*.pkl"
    ),
)


# ── fixtures compartidos (scope=module → se cargan una sola vez) ──────────────
@pytest.fixture(scope="module")
def loaded_artifacts():
    """Carga modelo y caches una sola vez para todo el módulo."""
    from app.models.model_loader import load_model, get_model
    from app.prediction.data_cache import preload_all
    assert load_model(), "El modelo no se pudo cargar"
    preload_all()
    return get_model()


@pytest.fixture(scope="module")
def sample_sensor_ids():
    """Devuelve hasta 5 sensor_id con perfil histórico conocido."""
    from app.prediction.data_cache import get_profile_idx
    profiles = get_profile_idx()
    ids = list({k[0] for k in profiles})[:5]
    assert ids, "No se encontraron sensores en historical_profiles"
    return ids


# ── Tests de inferencia por sensor ───────────────────────────────────────────
@needs_model
class TestTrafficInference:

    def test_prediccion_devuelve_dataframe_con_tres_columnas(
        self, loaded_artifacts, sample_sensor_ids
    ):
        from app.prediction.traffic_inference import predict_for_sensors
        preds, skipped = predict_for_sensors(
            [sample_sensor_ids[0]],
            dt="2025-06-10T09:00:00",
            weather={"lluvia_ord": 0, "precip_mm": 0.0},
        )
        assert not preds.empty, "La predicción no debe estar vacía"
        assert set(preds.columns) == {"intensidad", "ocupacion", "carga"}

    def test_valores_predichos_son_no_negativos(
        self, loaded_artifacts, sample_sensor_ids
    ):
        from app.prediction.traffic_inference import predict_for_sensors
        preds, _ = predict_for_sensors(
            [sample_sensor_ids[0]],
            dt="2025-06-10T09:00:00",
            weather={"lluvia_ord": 0, "precip_mm": 0.0},
        )
        row = preds.iloc[0]
        assert row["intensidad"] >= 0, "La intensidad no puede ser negativa"
        assert row["ocupacion"]  >= 0, "La ocupación no puede ser negativa"
        assert row["carga"]      >= 0, "La carga no puede ser negativa"

    def test_lluvia_intensa_produce_prediccion_diferente(
        self, loaded_artifacts, sample_sensor_ids
    ):
        """El modelo debe reaccionar diferente ante lluvia intensa vs sin lluvia."""
        from app.prediction.traffic_inference import predict_for_sensors
        sid = sample_sensor_ids[0]
        dry, _ = predict_for_sensors(
            [sid], dt="2025-06-10T09:00:00",
            weather={"lluvia_ord": 0, "precip_mm": 0.0},
        )
        wet, _ = predict_for_sensors(
            [sid], dt="2025-06-10T09:00:00",
            weather={"lluvia_ord": 3, "precip_mm": 25.0},
        )
        assert not dry.equals(wet), (
            "La predicción con lluvia intensa debe diferir de la predicción sin lluvia"
        )

    def test_sensor_inexistente_va_a_skipped(self, loaded_artifacts):
        from app.prediction.traffic_inference import predict_for_sensors
        fake_id = 999_999_999
        preds, skipped = predict_for_sensors(
            [fake_id],
            dt="2025-06-10T09:00:00",
            weather={"lluvia_ord": 0, "precip_mm": 0.0},
        )
        assert fake_id in skipped, "El sensor inexistente debe acabar en skipped"
        assert preds.empty, "No debe haber predicciones para un sensor inexistente"

    def test_multiples_sensores_todos_predichos(
        self, loaded_artifacts, sample_sensor_ids
    ):
        from app.prediction.traffic_inference import predict_for_sensors
        preds, skipped = predict_for_sensors(
            sample_sensor_ids,
            dt="2025-06-10T09:00:00",
            weather={"lluvia_ord": 0, "precip_mm": 0.0},
        )
        assert len(preds) + len(skipped) == len(sample_sensor_ids)
        assert len(preds) > 0, "Al menos un sensor debe tener predicción"

    def test_hora_punta_vs_madrugada(self, loaded_artifacts, sample_sensor_ids):
        """La intensidad predicha en hora punta debe ser mayor que de madrugada."""
        from app.prediction.traffic_inference import predict_for_sensors
        sid = sample_sensor_ids[0]
        weather = {"lluvia_ord": 0, "precip_mm": 0.0}

        punta, _ = predict_for_sensors(
            [sid], dt="2025-06-10T08:30:00", weather=weather,
        )
        madrugada, _ = predict_for_sensors(
            [sid], dt="2025-06-10T03:00:00", weather=weather,
        )
        if punta.empty or madrugada.empty:
            pytest.skip("Sensor sin predicción, test no aplicable")

        assert punta.iloc[0]["intensidad"] >= madrugada.iloc[0]["intensidad"], (
            "La intensidad en hora punta (8:30) debería ser >= que de madrugada (3:00)"
        )


# ── Tests del calculador de ETA ───────────────────────────────────────────────
@needs_model
class TestEtaCalculator:

    def test_compute_eta_retorna_tiempo_positivo(
        self, loaded_artifacts, sample_sensor_ids
    ):
        from app.prediction.traffic_inference import predict_for_sensors
        from app.eta.eta_calculator import compute_eta
        from app.routing.graph_loader import get_tipo_elem_int

        # Usar los 3 primeros sensores para simular una ruta de 2 tramos
        sids = sample_sensor_ids[:3]
        preds, _ = predict_for_sensors(
            sids, dt="2025-06-10T09:00:00",
            weather={"lluvia_ord": 0, "precip_mm": 0.0},
        )
        if preds.empty:
            pytest.skip("Sensores sin predicción")

        tipo_map = get_tipo_elem_int()
        distancias = [500.0] * (len(sids) - 1)
        result = compute_eta(sids, distancias, preds, tipo_map)

        assert "error" not in result, f"compute_eta devolvió error: {result.get('error')}"
        assert result["tiempo_total_s"] > 0
        assert result["tiempo_total_min"] > 0
        assert result["distancia_total_m"] == pytest.approx(sum(distancias))

    def test_congestión_alta_reduce_velocidad(
        self, loaded_artifacts, sample_sensor_ids
    ):
        """Con más carga/ocupación la velocidad media debe ser menor."""
        from app.eta.eta_calculator import vmed_from_predictions

        v_libre  = vmed_from_predictions(0.0,  0.0,  0.0,  tipo_elem=1)
        v_cong   = vmed_from_predictions(400.0, 80.0, 90.0, tipo_elem=1)
        assert v_libre > v_cong, (
            "Velocidad libre debe ser mayor que velocidad en congestión"
        )

    def test_velocidad_nunca_supera_v_libre(self, loaded_artifacts):
        from app.eta.eta_calculator import vmed_from_predictions
        from app.core.config import settings
        v = vmed_from_predictions(0.0, 0.0, 0.0, tipo_elem=1)
        assert v <= settings.BPR_V_LIBRE_M30

    def test_velocidad_tiene_minimo_realista(self, loaded_artifacts):
        from app.eta.eta_calculator import vmed_from_predictions
        v = vmed_from_predictions(9999.0, 99.0, 99.0, tipo_elem=0)
        assert v >= 10.0, "Velocidad mínima urbana debe ser >= 10 km/h"

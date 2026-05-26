"""Tests de integración de los endpoints de la API.

Usa el TestClient de FastAPI/httpx. El modelo NO se carga en estos tests
(lifespan deshabilitado), por lo que /predict devolverá 503 si lo llama
sin modelo — pero los endpoints de status y validación sí son comprobables.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    # with TestClient arranca la app SIN ejecutar el lifespan
    # (no carga el modelo), lo que es correcto para tests de API básicos.
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ---------------------------------------------------------------------------
# GET /
# ---------------------------------------------------------------------------
class TestRoot:
    def test_status_200(self, client):
        r = client.get("/")
        assert r.status_code == 200

    def test_contiene_nombre_api(self, client):
        data = client.get("/").json()
        assert "name" in data
        assert data["name"] == "prediccion-trafico-api"

    def test_contiene_version(self, client):
        data = client.get("/").json()
        assert "version" in data


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------
class TestHealth:
    def test_status_200(self, client):
        r = client.get("/health")
        assert r.status_code == 200

    def test_contiene_model_loaded(self, client):
        data = client.get("/health").json()
        assert "model_loaded" in data
        assert isinstance(data["model_loaded"], bool)

    def test_sin_modelo_model_loaded_false(self, client):
        # En tests el lifespan no se ejecuta → modelo no cargado
        data = client.get("/health").json()
        assert data["model_loaded"] is False


# ---------------------------------------------------------------------------
# POST /predict — validación de esquema (sin modelo)
# ---------------------------------------------------------------------------
class TestPredictValidation:
    def test_body_vacío_devuelve_422(self, client):
        r = client.post("/predict", json={})
        assert r.status_code == 422

    def test_faltan_campos_obligatorios(self, client):
        r = client.post("/predict", json={"origin": "Atocha, Madrid"})
        assert r.status_code == 422

    def test_campos_completos_no_422(self, client):
        r = client.post("/predict", json={
            "origin": "Atocha, Madrid",
            "destination": "Callao, Madrid",
            "datetime": "2024-06-10T08:00:00",
        })
        # Sin modelo: 500 o 503, pero no 422 (el esquema es válido)
        assert r.status_code != 422


# ---------------------------------------------------------------------------
# GET /debug/bpr
# ---------------------------------------------------------------------------
class TestDebugBpr:
    def test_devuelve_alpha_y_beta(self, client):
        data = client.get("/debug/bpr").json()
        assert "alpha" in data
        assert "beta" in data
        assert data["alpha"] > 0
        assert data["beta"] > 0

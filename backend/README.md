# Backend — Predicción de Tráfico M30 (TFG)

Backend FastAPI del TFG de predicción de tráfico en la M30 de Madrid.
Expone la lógica de los notebooks de investigación como una API modular: routing sobre el grafo de sensores, predicción de tráfico con modelos de deep learning, estimación de tiempo de llegada (ETA) e información meteorológica.

> Esta carpeta es **autónoma**: no modifica ni depende de los notebooks `.ipynb` del proyecto.

---

## Estructura

```
backend/
├── app/
│   ├── main.py                # Entrada de la app FastAPI
│   ├── api/
│   │   └── v1/                # Routers versionados
│   │       ├── routing.py
│   │       ├── prediction.py
│   │       ├── eta.py
│   │       └── weather.py
│   ├── core/
│   │   └── config.py          # Settings, paths, variables de entorno
│   ├── services/              # Lógica de negocio por dominio
│   │   ├── routing/
│   │   ├── prediction/
│   │   ├── eta/
│   │   └── weather/
│   ├── schemas/               # Modelos Pydantic (request/response)
│   ├── modelos/               # Artefactos de modelos entrenados (excluidos de git)
│   └── utils/                 # Utilidades transversales
├── tests/
├── requirements.txt
├── .gitignore
└── README.md
```

### Dominios

| Módulo       | Responsabilidad                                                      |
|--------------|----------------------------------------------------------------------|
| `routing`    | Grafo OSM de sensores, Dijkstra, sensores que atraviesa una ruta.    |
| `prediction` | Carga de modelos DL (LSTM/GRU/BiLSTM/CNN-LSTM) e inferencia.         |
| `eta`        | Estimación de tiempo de viaje combinando ruta + vmed predicha + BPR. |
| `weather`    | Integración con APIs meteorológicas externas.                        |
| `utils`      | Funciones auxiliares compartidas.                                    |
| `modelos`    | Artefactos serializados de modelos entrenados.                       |

---

## Puesta en marcha

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Documentación interactiva (cuando `main.py` esté implementado):
- Swagger UI → http://localhost:8000/docs
- ReDoc → http://localhost:8000/redoc

---

## Estado

Esqueleto inicial. Los archivos contienen únicamente docstrings de propósito; la lógica se irá añadiendo de forma incremental sin tocar los notebooks de investigación.

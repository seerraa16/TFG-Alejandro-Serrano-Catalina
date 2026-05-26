# TFG — Predicción de Tráfico en la M30 de Madrid

Aplicación de predicción de tiempo de viaje en tiempo real para Madrid. Combina un modelo LSTM entrenado con datos de sensores DGT, routing sobre la red vial real (OSMnx) y datos meteorológicos de Open-Meteo para estimar el tiempo de llegada a cualquier destino.

---

## Estructura del proyecto

```text
TFG-Alejandro-Serrano-Catalina/
├── backend/          # API REST (FastAPI + LSTM)
├── frontend/         # App móvil (React + Tailwind)
├── data/             # Datos de entrenamiento (.parquet)
├── outputs/          # Modelos entrenados, grafos y artefactos de inferencia
├── models/           # Scalers y versiones antiguas
└── *.ipynb           # Notebooks de EDA, entrenamiento e inferencia
```

---

## Requisitos previos

| Herramienta | Versión recomendada |
| --- | --- |
| Python | 3.11 (entorno conda `ssrr`) |
| Node.js | 18 o superior |
| npm | 9 o superior |
| Conda | cualquier versión reciente |

---

## Instalación y puesta en marcha

### 1. Clonar el repositorio

```bash
git clone https://github.com/seerraa16/TFG-Alejandro-Serrano-Catalina.git
cd TFG-Alejandro-Serrano-Catalina
```

### 2. Backend

```bash
# Activar el entorno conda
conda activate ssrr

# Instalar dependencias Python
cd backend
pip install -r requirements.txt

# Arrancar el servidor (desde la carpeta backend/)
uvicorn app.main:app --reload
```

La API quedará disponible en `http://localhost:8000`.
Documentación interactiva: `http://localhost:8000/docs`

> **Nota:** el backend necesita que existan los artefactos de inferencia en `outputs/inferencia/` (generados por `inferencia_app.ipynb`) y el modelo en `outputs/lstm_last.keras`. Si alguno falta, el servidor arranca igualmente pero los endpoints de predicción devolverán error.

### 3. Frontend

```bash
# Desde la raíz del proyecto
cd frontend
npm install
npm run dev
```

La app estará disponible en `http://localhost:5173`.

---

## Variables de entorno

### Backend (`backend/.env`)

Crea el archivo `backend/.env` (no está en el repositorio) con las siguientes variables si quieres cambiar el comportamiento por defecto:

```env
# Orígenes permitidos para CORS (separados por coma)
# Por defecto acepta localhost:5173 y localhost:3000
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Frontend

El Client ID de Google OAuth está en `frontend/src/main.jsx`. Para usar tu propia cuenta de Google Cloud:

1. Crea un proyecto en Google Cloud Console
2. Activa la API de Google Calendar
3. Crea credenciales OAuth 2.0 (tipo: Web)
4. Sustituye el `clientId` en `main.jsx`

---

## Ejecutar los tests

```bash
cd backend
pytest tests/ -v
```

Los tests no requieren el modelo cargado ni datos en disco.

---

## Arquitectura

```text
Frontend (React)
    │
    │  POST /predict          POST /agent/chat
    ▼                              ▼
Backend (FastAPI)
    │
    ├── Geocodificación (Nominatim + caché local)
    ├── Routing (OSMnx sobre red vial Madrid)
    ├── Meteorología (Open-Meteo API)
    ├── Features (perfiles históricos DGT)
    ├── Inferencia LSTM  →  (intensidad, ocupación, carga) por sensor
    └── ETA (modelo BPR)  →  tiempo total en minutos
```

---

## Modelos entrenados disponibles

| Archivo | Arquitectura | Uso |
| --- | --- | --- |
| `lstm_last.keras` | LSTM profundo | **Producción** (API) |
| `exp1_lstm_deep_best.keras` | LSTM profundo (experimento 1) | Comparativa |
| `exp2_gru_baseline_best.keras` | GRU baseline | Comparativa |
| `exp3_gru_deep_best.keras` | GRU profundo | Comparativa |

Todos aceptan entrada `(N, 4, 22)` y devuelven `(N, 1, 3)` (intensidad, ocupación, carga).

---

## Tecnologías principales

**Backend:** FastAPI · TensorFlow/Keras · OSMnx · NetworkX · Pandas · Open-Meteo
**Frontend:** React 18 · Tailwind CSS · Leaflet · React Router · Google OAuth
**ML:** LSTM · GRU · modelo BPR para cálculo de ETA
**Datos:** Sensores DGT Madrid · OpenStreetMap

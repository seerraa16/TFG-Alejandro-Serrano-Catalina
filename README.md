# TFG — Predicción de Tráfico Urbano en la M-30 de Madrid

## Trabajo de Fin de Grado · Alejandro Serrano Catalina

Sistema integral de predicción de tráfico urbano para la red M-30 y vías urbanas de Madrid mediante redes neuronales recurrentes bidireccionales (BiLSTM). Entrena y compara seis arquitecturas de aprendizaje profundo sobre 37,5 millones de registros históricos de sensores DGT (2021–2024) y sirve las predicciones a través de una API REST integrada en una aplicación web con cálculo de ETA en tiempo real.

---

## Resultados del modelo en producción

| Modelo | MAE intensidad | RMSE intensidad | R² intensidad | MAE ocupación | MAE carga |
| --- | --- | --- | --- | --- | --- |
| LSTM v1 (baseline) | 43,34 veh/h | 106,97 | 0,962 | 1,68 % | 2,49 |
| GRU | 46,98 veh/h | 110,92 | 0,961 | 1,66 % | 2,44 |
| Transformer | 45,93 veh/h | 111,11 | 0,961 | 1,70 % | 2,45 |
| Transformer Grande | 45,53 veh/h | 102,21 | — | 1,67 % | 2,43 |
| BiGRU | 40,45 veh/h | 100,93 | 0,967 | 1,57 % | 2,21 |
| **BiLSTM v2 (producción)** | **39,44 veh/h** | **100,41** | **0,968** | **1,56 %** | **2,20** |
| Ensamble (BiLSTM v2 + BiGRU) | **39,32 veh/h** | **99,21** | **0,968** | **1,56 %** | **2,18** |

El BiLSTM v2 mejora al LSTM v1 un **9,0%** en MAE de intensidad, **7,3%** en ocupación y **11,6%** en carga. El ensamble (BiLSTM v2 + BiGRU) obtiene el mejor MAE absoluto pero se descarta en producción por complejidad operativa. Entrenado con pérdida Huber(δ=1,0) y precisión mixta fp16 sobre GPU AMD Radeon RX 6700 XT mediante PyTorch/ROCm. El Transformer Grande no dispone de R² individual (calculado sólo en el contexto del ensamble).

---

## Arquitectura del sistema

```text
Datos de entrada
├── 1.069 sensores DGT  →  intensidad (veh/h), ocupación (%), carga (0–100)
├── Precipitación ERA5 (ECMWF/Copernicus)  →  lluvia_ord, precip_mm
└── Accidentalidad municipal M-30 (2021–2024)  →  hay_accidente, tiempo_accidente_norm

Pipeline de preprocesamiento
└── 37,5 M registros · 22 features · SEQ_LEN=12 (3 h de historial) · partición 70/15/15

Modelos entrenados (6 + ensamble)
└── LSTM v1 · BiLSTM v2* · GRU · BiGRU · Transformer · Transformer Grande · Ensamble

Sistema de servicio
┌─────────────────────────────────────────────────┐
│  Frontend (React 18 + Leaflet)                  │
│    ├── Mapa interactivo de Madrid (OSM)         │
│    ├── Cálculo de rutas y ETA (modelo BPR)      │
│    ├── Meteorología en tiempo real (Open-Meteo) │
│    ├── Semáforos de OpenStreetMap               │
│    └── Agente conversacional (Llama 3 / Ollama) │
│                  │                              │
│  Backend (FastAPI)                              │
│    ├── Geocodificación (Nominatim + caché)      │
│    ├── Routing (OSMnx · 9.198 nodos · 17.885 aristas)
│    ├── Inferencia BiLSTM v2  →  (intensidad, ocupación, carga)
│    └── ETA (modelo BPR con predicciones en tiempo real)
└─────────────────────────────────────────────────┘
```

---

## Estructura del repositorio

```text
TFG-Alejandro-Serrano-Catalina/
├── backend/                  # API REST (FastAPI + BiLSTM)
│   ├── app/
│   │   ├── api/              # Endpoints REST
│   │   ├── core/             # Configuración y arranque
│   │   ├── eta/              # Modelo BPR
│   │   ├── modelos/          # Carga e inferencia BiLSTM
│   │   ├── prediction/       # Pipeline de predicción
│   │   ├── routing/          # OSMnx y cálculo de rutas
│   │   ├── weather/          # Integración Open-Meteo
│   │   └── main.py
│   ├── requirements.txt
│   └── tests/
├── frontend/                 # Aplicación web (React 18)
│   └── src/
│       ├── components/       # Componentes UI (Header, BottomNav…)
│       ├── screens/          # Pantallas de la app
│       ├── api/              # Llamadas al backend
│       └── context/
├── MODELOS/                  # Notebooks de entrenamiento
│   ├── MMMModel.ipynb        # LSTM v1 (baseline)
│   ├── Modelo2.0.ipynb       # BiLSTM v2 (producción)
│   ├── Modelo_GRU.ipynb
│   ├── Modelo_BiGRU.ipynb
│   ├── Modelo_Transformer.ipynb
│   ├── Modelo_Transformer_grande.ipynb
│   └── Modelo_Ensemble.ipynb
├── SALIDAS modelo */         # Métricas, curvas y predicciones por modelo
├── scripts/                  # Utilidades (exportar scalers, validar ETA)
├── outputs/                  # Artefactos de inferencia generados
├── eda_outputs/              # Figuras y estadísticas del EDA
└── Pruebas de grafos/        # Experimentos con OSMnx
```

---

## Datos

| Fuente | Descripción | Período |
| --- | --- | --- |
| [Portal Datos Abiertos Ayuntamiento Madrid](https://datos.madrid.es) | 1.069 sensores DGT, 15 min, intensidad/ocupación/carga/vmed | 2021–2024 |
| ERA5 / ECMWF (Copernicus) | Precipitación total (tp), resolución horaria, área Madrid | 2020–2024 |
| Accidentalidad vial municipal | Registros M-30: localización, fecha/hora y categoría de víctimas | 2021–2024 |

El dataset final tras preprocesamiento: **37.538.007 filas · 22 features · 1.067 sensores** · partición temporal 70/15/15 sin aleatorización.

---

## Requisitos previos

| Herramienta | Versión |
| --- | --- |
| Python | 3.11 (entorno conda `ssrr`) |
| Node.js | 18 o superior |
| npm | 9 o superior |
| PyTorch/ROCm | Para reentrenar en GPU AMD (opcional) |
| Ollama | Para el agente conversacional Llama 3 (opcional) |

---

## Instalación y puesta en marcha

### 1. Clonar el repositorio

```bash
git clone https://github.com/seerraa16/TFG-Alejandro-Serrano-Catalina.git
cd TFG-Alejandro-Serrano-Catalina
```

### 2. Backend

```bash
conda activate ssrr
cd backend
pip install -r requirements.txt

# Arrancar el servidor
uvicorn app.main:app --reload
```

API disponible en `http://localhost:8000` · Documentación interactiva: `http://localhost:8000/docs`

> **Nota:** El backend necesita los artefactos de inferencia en `outputs/inferencia/` y el modelo BiLSTM en `outputs/`. Si faltan, el servidor arranca pero los endpoints de predicción devolverán error.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App disponible en `http://localhost:5173`

### 4. Agente conversacional (opcional)

```bash
# Instalar Ollama y descargar Llama 3
ollama pull llama3
```

El backend detecta automáticamente si Ollama está disponible en `localhost:11434`.

---

## Variables de entorno

Crea `backend/.env` (no incluido en el repositorio):

```env
# Orígenes CORS permitidos (por defecto: localhost:5173 y localhost:3000)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## Ejecutar los tests

```bash
cd backend
pytest tests/ -v
```

Los tests no requieren el modelo cargado ni datos en disco.

---

## Features del modelo

El tensor de entrada tiene formato `(n_muestras, 12, 22)` — 3 horas de historial, 22 variables por paso:

| Grupo | Features |
| --- | --- |
| Targets (lags) | intensidad_lag_1..12, ocupacion_lag_1..12, carga_lag_1..12 |
| Temporales cíclicas | slot_sin/cos (96 slots/día), dia_sem_sin/cos, mes_sin/cos |
| Calendario | es_laborable, tipo_elem (URB/M30) |
| Meteorología | lluvia_ord (0–3), precip_mm |
| Accidentalidad | hay_accidente, accidente_reciente_1h, tiempo_accidente_norm |
| Medias móviles | intensidad/ocupacion/carga `_roll4` (1h) y `_roll8` (2h) |

---

## Tecnologías principales

**Backend:** FastAPI · PyTorch · OSMnx · NetworkX · Pandas · scikit-learn · Open-Meteo  
**Frontend:** React 18 · Leaflet · Tailwind CSS · React Router  
**ML:** BiLSTM · GRU · Transformer · modelo BPR (ETA) · Llama 3 (agente)  
**Datos:** Sensores DGT Madrid · ERA5/Copernicus · OpenStreetMap  
**Entrenamiento:** PyTorch/ROCm · GPU AMD Radeon RX 6700 XT · precisión mixta fp16

---

## Palabras clave

predicción de tráfico · aprendizaje profundo · LSTM bidireccional · redes neuronales recurrentes · series temporales · M-30 Madrid · estimación de tiempo de llegada · FastAPI · React · agente conversacional · LLM local

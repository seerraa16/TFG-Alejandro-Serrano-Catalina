# Justificación académica del modelo LSTM de predicción de tráfico

**Modelo:** `lstm_last.keras` (referenciado como *lstm_original* en `results_lstm_original.json`).
**Notebook fuente:** `MMMModel.ipynb`.
**Targets predichos:** `intensidad_trafico`, `ocupacion`, `carga` (multi-output simultáneo).

---

## 1. Arquitectura del modelo

El modelo implementa una red recurrente **LSTM apilada (stacked LSTM)** diseñada para regresión multivariable sobre ventanas temporales cortas. La elección de LSTM frente a una red densa o convolucional se fundamenta en la naturaleza secuencial y autocorrelacionada del tráfico urbano: el estado de un sensor en el instante *t* depende de su trayectoria reciente y de patrones intradiarios persistentes (hora punta, congestión propagada).

| Capa | Tipo | Configuración | Salida |
|---|---|---|---|
| `seq_input` | Input | shape `(4, 22)` | `(batch, 4, 22)` |
| `lstm_1` | LSTM | 128 unidades, `return_sequences=True` | `(batch, 4, 128)` |
| `drop_1` | Dropout | tasa 0.2 | `(batch, 4, 128)` |
| `lstm_2` | LSTM | 64 unidades, `return_sequences=False` | `(batch, 64)` |
| `drop_2` | Dropout | tasa 0.2 | `(batch, 64)` |
| `dense_hidden` | Dense | 32 unidades, activación ReLU | `(batch, 32)` |
| `output` | Dense | 3 unidades, lineal (`dtype=float32`) | `(batch, 3)` |

- **Parámetros entrenables:** 128 899.
- **Longitud de la secuencia de entrada (`SEQ_LEN`):** 4 pasos temporales (correspondientes a 4 ventanas de 15 minutos = 1 hora de historia).
- **Número de features por paso (`N_FEATURES`):** 22 variables exógenas y autorregresivas.
- **Política de precisión:** `mixed_float16` para acelerar el entrenamiento en GPU manteniendo la capa de salida en `float32` (evita pérdida de precisión en el cálculo del *loss*).
- **Optimizador:** Adam, `learning_rate` inicial = 3·10⁻⁴.
- **Función de pérdida:** MSE (Mean Squared Error). Métricas monitorizadas: MAE, RMSE y R².

La arquitectura sigue el principio de **reducción progresiva de dimensionalidad** (128 → 64 → 32 → 3), habitual en regresión secuencial: las primeras capas codifican el contexto temporal con alta capacidad y las posteriores refinan la representación hasta la salida multivariable. Los *dropouts* del 20 % entre capas LSTM constituyen la regularización principal.

---

## 2. Tabla de métricas finales (conjunto de test)

| Variable objetivo | MAE | RMSE | RMSE / MAE |
|---|---:|---:|---:|
| `intensidad_trafico` | **43.343** | **106.973** | 2.468 |
| `ocupacion` | **1.684** | **3.915** | 2.325 |
| `carga` | **2.488** | **4.279** | 1.719 |
| **Media simple** | **15.838** | **38.389** | — |

> Las unidades de `intensidad_trafico` son vehículos/hora; `ocupacion` se expresa en porcentaje (%); `carga` es un índice adimensional definido por el Ayuntamiento de Madrid.

Estas cifras provienen directamente del fichero `results_lstm_original.json` generado por el notebook en la fase de evaluación final sobre el conjunto de test (datos no vistos durante el entrenamiento ni la validación).

---

## 3. Justificación académica de las métricas elegidas

### 3.1 Por qué MAE

El **Error Absoluto Medio (MAE)** se define como la media de las diferencias absolutas entre la predicción y el valor real:

```
MAE = (1/N) Σ |y_real − y_predicho|
```

En el contexto de predicción de tráfico, el MAE posee dos propiedades especialmente convenientes:

1. **Interpretabilidad directa:** un MAE de 43 vehículos/hora en `intensidad_trafico` se lee literalmente como «en promedio el modelo se equivoca en 43 vehículos por hora», cifra que cualquier responsable de gestión de tráfico puede valorar frente al rango operativo de las espiras electromagnéticas de la M-30 (típicamente 0 – 8 000 veh/h).
2. **Robustez frente a *outliers*:** al no elevar el error al cuadrado, no penaliza desproporcionadamente los picos puntuales (cambios de carril, incidencias, fallos puntuales de sensor). Esto es relevante porque el preprocesamiento (fase §4.4 del notebook) detectó valores extremos por encima del percentil 99 que se conservaron en el dataset por contener información real de congestión.

### 3.2 Por qué RMSE

El **Error Cuadrático Medio Raíz (RMSE)** se define como:

```
RMSE = √[ (1/N) Σ (y_real − y_predicho)² ]
```

A diferencia del MAE, el RMSE **eleva al cuadrado los errores antes de promediarlos**, por lo que penaliza con mayor severidad los errores grandes. Su justificación en este TFG es doble:

1. **Coherencia con la función de pérdida:** el modelo fue entrenado minimizando MSE, por lo que reportar RMSE (su raíz cuadrada) preserva la unidad de la variable predicha y permite comparar directamente la magnitud del error con la pérdida optimizada.
2. **Sensibilidad a errores graves:** en gestión de tráfico, un error puntual grande (por ejemplo, no detectar el inicio de una congestión severa) tiene un coste operativo mayor que muchos errores pequeños distribuidos. El RMSE captura ese coste asimétrico mejor que el MAE.

### 3.3 Por qué reportar ambas

El criterio metodológico habitual en *time-series forecasting* (Hyndman & Athanasopoulos, *Forecasting: Principles and Practice*, 3.ª ed., 2021) recomienda reportar las dos métricas conjuntamente: el MAE describe el comportamiento *medio* del modelo y el RMSE descubre la *variabilidad* del error. La comparación entre ambas (ratio RMSE/MAE) es por sí misma una herramienta diagnóstica, como se analiza en la sección 5.

---

## 4. Early stopping y prevención de sobreajuste

El entrenamiento se configuró para un máximo de **50 épocas** pero se interrumpió de forma automática en la **época 42** mediante el *callback* `EarlyStopping` (monitor = `val_loss`, `patience = 10`, `restore_best_weights = True`).

### 4.1 Cómo opera el mecanismo

`EarlyStopping` detiene el entrenamiento cuando la pérdida en validación no mejora durante `patience` épocas consecutivas. Al activar `restore_best_weights=True`, Keras revierte los pesos al estado en el que se obtuvo la mejor `val_loss` (en este experimento, **época 32**, con `val_loss = 0.1066` normalizado), descartando las 10 épocas posteriores en las que la red ya estaba sobreajustando ligeramente al conjunto de entrenamiento.

### 4.2 Por qué es la decisión correcta desde el punto de vista académico

1. **Principio de parsimonia (Occam):** entre dos modelos con error de validación equivalente se prefiere el de menor capacidad efectiva, y un modelo entrenado durante menos épocas tiende a generalizar mejor (Bishop, *Pattern Recognition and Machine Learning*, cap. 5.5).
2. **Eficiencia computacional:** se evitaron 8 épocas adicionales planificadas (50 − 42), reduciendo el coste energético y de cómputo sin sacrificar calidad predictiva.
3. **Sinergia con `ReduceLROnPlateau`:** un segundo *callback* redujo el *learning rate* a la mitad (`factor=0.5`) tras 5 épocas sin mejora, llevándolo desde 3·10⁻⁴ hasta ≈ 9·10⁻⁹ en las últimas épocas. Esta combinación —*scheduling* del LR seguido de parada por estancamiento— es la práctica estándar en redes neuronales profundas y constituye una doble salvaguarda frente al sobreajuste.

La decisión de aceptar la parada en la época 42 (con pesos de la 32) está documentada en el campo `stopped_early: true` de `results_lstm_original.json` y respaldada por la curva de entrenamiento `fase5_training_curve.png`, donde se observa la convergencia y estabilización de las cuatro métricas (loss, MAE, RMSE, R²) tanto en *train* como en *val*.

---

## 5. Análisis del ratio RMSE/MAE

El cociente RMSE/MAE es un **indicador adimensional** de la distribución del error: si todos los errores fueran idénticos en magnitud, el ratio valdría 1; cuanto mayor sea, más asimétrica es la distribución y más peso tienen los errores grandes en el total.

| Variable | RMSE/MAE | Interpretación |
|---|---:|---|
| `intensidad_trafico` | **2.468** | Ratio elevado. La distribución del error tiene cola larga: el modelo es bueno en promedio pero comete errores grandes en eventos puntuales (probablemente horas punta o congestiones atípicas, donde la intensidad oscila bruscamente). |
| `ocupacion` | **2.325** | Similar comportamiento al de la intensidad, lo cual es coherente: ambas variables comparten dinámica subyacente (a más vehículos por unidad de tiempo, mayor ocupación de la espira). |
| `carga` | **1.719** | Ratio sensiblemente más bajo. La variable `carga` es un índice acotado, más suave temporalmente, por lo que el error se distribuye de forma más homogénea y los *outliers* son menos frecuentes. |

### Implicación académica

La diferencia entre el ratio de `carga` (~1.7) y el de `intensidad_trafico` / `ocupacion` (~2.3 – 2.5) confirma una hipótesis natural del problema: **las variables con mayor varianza intrínseca y mayor sensibilidad a eventos discretos (un coche que pasa, una incidencia) son intrínsecamente más difíciles de predecir con un modelo determinista**. En términos prácticos, esto sugiere que la `carga` puede usarse como predictor «agregado» fiable, mientras que `intensidad_trafico` requiere un modelo más sofisticado o un *ensemble* si se desea reducir la cola de errores.

Como referencia teórica, en una distribución gaussiana ideal de los residuos el ratio RMSE/MAE tiende a √(π/2) ≈ 1.253. Los valores observados, claramente superiores, indican distribuciones de error **leptocúrticas** (con colas más pesadas que la normal), un patrón habitual en series temporales de movilidad urbana.

---

## 6. Limitaciones del modelo

1. **Ventana temporal corta (`SEQ_LEN = 4`).** La red sólo observa 1 hora de historia. Patrones de mayor escala (semanal, estacional) deben inferirse a partir de las 22 variables exógenas (codificación cíclica de hora/día/mes, festividades, etc.), no del historial autorregresivo.
2. **Ausencia de información espacial.** El modelo trata cada sensor de forma independiente; no aprovecha la topología de la red viaria. Un modelo *graph-based* (GNN o ST-GCN) podría capturar la propagación de congestión entre sensores conectados.
3. **Régimen de error asimétrico.** Como se discute en §5, el ratio RMSE/MAE elevado en intensidad y ocupación revela que los peores errores se concentran en eventos atípicos (congestiones, incidencias). El modelo no incorpora datos contextuales (incidencias en tiempo real, eventos deportivos, obras) que podrían anticipar esos eventos.
4. **Multi-output con pérdida única.** Se minimiza una MSE global sobre las tres variables tras normalizar, lo que puede sesgar el entrenamiento hacia la variable de mayor varianza. Una pérdida ponderada o un esquema *multi-task* con cabezas separadas podría rebalancear la optimización.
5. **Determinismo de la predicción.** La salida es un punto, no una distribución. Para aplicaciones operativas conviene asociar intervalos de confianza (p. ej. mediante *Monte Carlo Dropout* o *quantile regression*).
6. **Validación temporal puntual.** Se reporta una única partición train/val/test. Una validación con *rolling-window* sería metodológicamente más sólida para series temporales largas.

---

## 7. Líneas de trabajo futuro

1. **Modelos espaciotemporales.** Incorporar la topología de la red de sensores mediante *Graph Neural Networks* (DCRNN, ST-GCN, A3T-GCN). El grafo de sensores ya está construido en `outputs/grafo_sensores.graphml` y constituye el punto de partida natural.
2. **Arquitecturas avanzadas.** Comparar la LSTM apilada con (i) *Transformers* para series temporales (Informer, PatchTST), (ii) modelos híbridos CNN-LSTM, (iii) modelos *state-space* como S4. Los notebooks `mmmmodel_exp1_lstm_deep.ipynb`, `mmmmodel_exp2_gru_baseline.ipynb` y `mmmmodel_exp3_gru_deep.ipynb` ya exploran parte de este espacio.
3. **Predicción probabilística.** Sustituir la salida puntual por una predicción cuantílica (loss *pinball*) para obtener intervalos de confianza al 90 % y 95 %.
4. **Horizonte de predicción ampliado.** El modelo actual predice un único paso (15 min). Extenderlo a *multi-step forecasting* (1 h, 4 h, 24 h) mediante esquemas *seq2seq* o *direct multi-output*.
5. **Inclusión de contexto exógeno.** Datos meteorológicos en tiempo real, calendario de eventos masivos en Madrid (Wanda Metropolitano, IFEMA, Bernabéu), incidencias publicadas por la DGT.
6. **Estudio de robustez.** Inyección controlada de ruido y *missing data* en sensores durante inferencia para evaluar la degradación; complementarlo con un módulo de imputación previa.
7. **Evaluación operativa.** Más allá de MAE/RMSE, definir métricas de utilidad: capacidad de anticipar congestiones (precision/recall sobre eventos binarizados), tiempo medio de anticipación, coste asociado a falsos negativos.
8. **Despliegue y monitorización.** Integrar el modelo en el *backend* ya iniciado (`backend/app/core/config.py`) con monitorización continua del *drift* de las métricas en producción.

---

## 8. Archivos adjuntos en esta carpeta

| Fichero | Descripción |
|---|---|
| `lstm_last.keras` | Pesos del modelo entrenado (último checkpoint de la época 42). |
| `metricas.json` | Métricas consolidadas: arquitectura, configuración de entrenamiento, métricas de test y resumen del historial. |
| `history_training.json` | Historial completo de las 42 épocas (loss, MAE, RMSE, R² y *learning rate* en *train* y *val*). |
| `fase5_training_curve.png` | Curvas de entrenamiento (grid 2×2: loss, MAE, RMSE, R²) con marca del mejor *epoch*. |
| `fase5_comparativa_final.png` | Comparativa final del modelo frente a los baselines de la fase 5. |
| `fase4_comparativa.png` | Comparativa de modelos de la fase 4 (contexto previo). |
| `fase4_feature_importance.png` | Importancia de las 22 *features* de entrada (fase 4). |
| `justificacion_tfg.md` | Este documento. |

"""Endpoint POST /agent/chat — Agente IA local (Ollama) para consultas de tráfico."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timedelta
from typing import Any

import ollama
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.prediction import PredictionError, predict_eta

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])

OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    home_address: str = "Madrid"
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    response: str
    eta_minutes: float | None = None
    departure_time: str | None = None
    origin: str | None = None
    destination: str | None = None
    departure_datetime_iso: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ollama_client() -> ollama.Client:
    return ollama.Client(host=OLLAMA_HOST)


def _weekday_es(dt: datetime) -> str:
    names = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    return names[dt.weekday()]


def _extract_json(text: str) -> dict | None:
    """Extrae el primer bloque JSON válido del texto del modelo."""
    # Busca bloques ```json ... ``` o ``` ... ```
    code_block = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if code_block:
        try:
            return json.loads(code_block.group(1))
        except json.JSONDecodeError:
            pass
    # Busca cualquier objeto JSON en el texto
    for match in re.finditer(r"\{[^{}]*\}", text, re.DOTALL):
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            continue
    return None


def _run_prediction(params: dict[str, Any]) -> dict[str, Any]:
    arrival_dt = datetime.fromisoformat(params["arrival_datetime"])
    departure_guess = arrival_dt - timedelta(minutes=30)

    result = predict_eta(
        origen=params["origin"],
        destino=params["destination"],
        dt=departure_guess,
    )

    eta_min: float = result["tiempo_total_min"]
    departure_recommended = arrival_dt - timedelta(minutes=eta_min + 5)

    predictions: dict = result.get("predictions", {})
    high_occ = [
        {
            "sensor_id": sid,
            "ocupacion_pct": round(v["ocupacion"], 1),
            "carga": round(v["carga"], 1),
        }
        for sid, v in predictions.items()
        if v.get("ocupacion", 0) > 40
    ]
    high_occ.sort(key=lambda x: x["ocupacion_pct"], reverse=True)

    rs = result["route_summary"]
    weather = result.get("weather", {})

    return {
        "eta_minutes": round(eta_min, 1),
        "distance_km": round(result["distancia_total_m"] / 1000, 2),
        "avg_speed_kmh": round(result.get("velocidad_media_kmh") or 0, 1),
        "departure_recommended": departure_recommended.strftime("%H:%M"),
        "arrival_time": arrival_dt.strftime("%H:%M"),
        "departure_datetime_iso": departure_recommended.isoformat(),
        "travel_date": arrival_dt.strftime("%A %d/%m/%Y"),
        "n_sensors_total": rs["n_sensores_ruta"],
        "n_sensors_predicted": rs["n_sensores_predichos"],
        "high_occupancy_sensors": high_occ[:5],
        "weather": {
            "precipitacion_mm": weather.get("precip_mm", 0),
            "lluvia_ord": weather.get("lluvia_ord", 0),
            "temperatura_c": weather.get("temperatura"),
            "prob_lluvia_pct": weather.get("prob_lluvia", 0),
        },
        "origin": params["origin"],
        "destination": params["destination"],
    }


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

def _extraction_system(today: datetime, home_address: str) -> str:
    day = _weekday_es(today)
    return (
        f"Eres un extractor de parámetros de viaje. Hoy es {day} {today.strftime('%d/%m/%Y')} "
        f"a las {today.strftime('%H:%M')}. "
        f"La dirección de casa del usuario es: {home_address}.\n\n"
        "Cuando el usuario describa un viaje, responde ÚNICAMENTE con un JSON válido con esta estructura:\n"
        '{"origin": "...", "destination": "...", "arrival_datetime": "YYYY-MM-DDTHH:MM:SS", '
        '"question_type": "departure_time"}\n\n'
        "Reglas:\n"
        "- origin: si no se menciona, usa la dirección de casa.\n"
        "- destination: nombre del lugar o dirección.\n"
        "- arrival_datetime: la hora a la que el usuario necesita llegar. "
        "Infiere año y mes desde la fecha de hoy. Si dice 'el lunes' sin fecha concreta, "
        "calcula el próximo lunes.\n"
        "- question_type: 'departure_time' si pregunta cuándo salir; 'eta' si pregunta cuánto tarda.\n"
        "Si el mensaje no tiene nada que ver con un viaje, responde con: "
        '{"error": "no_trip"}\n'
        "NO añadas ningún texto fuera del JSON."
    )


def _explanation_system(today: datetime, home_address: str) -> str:
    day = _weekday_es(today)
    return (
        f"Eres un asistente de tráfico inteligente para Madrid. "
        f"Hoy es {day} {today.strftime('%d/%m/%Y')}. "
        f"La dirección de casa del usuario es: {home_address}.\n\n"
        "Se te proporcionan datos reales de predicción de tráfico calculados con un modelo LSTM "
        "entrenado con datos de sensores de la DGT en Madrid. "
        "Explica al usuario en español:\n"
        "1. A qué hora se recomienda salir y por qué.\n"
        "2. Cuánto tiempo tardará y la distancia.\n"
        "3. Si hay sensores con ocupación alta (>40%), avisa de que puede haber tráfico en esas zonas.\n"
        "4. Si llueve o la temperatura es extrema, menciónalo brevemente.\n"
        "Sé conciso, amigable y práctico. Puedes usar algún emoji."
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=ChatResponse)
def agent_chat(req: ChatRequest) -> ChatResponse:
    """Agente conversacional de tráfico con LLM local (Ollama) + modelo LSTM propio."""
    today = datetime.now()
    client = _ollama_client()

    # Comprobamos que Ollama esté disponible
    try:
        client.list()
    except Exception as e:
        logger.error("Ollama no disponible en %s: %s", OLLAMA_HOST, e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"Ollama no está disponible en {OLLAMA_HOST}. "
                "Asegúrate de tener Ollama ejecutándose (`ollama serve`)."
            ),
        ) from e

    # -----------------------------------------------------------------------
    # 1) Extraer parámetros del viaje vía LLM
    # -----------------------------------------------------------------------
    history_msgs = [{"role": m.role, "content": m.content} for m in req.history]
    extract_messages = history_msgs + [{"role": "user", "content": req.message}]

    try:
        resp1 = client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": _extraction_system(today, req.home_address)},
                *extract_messages,
            ],
            options={"temperature": 0.1},   # baja temperatura para extracción fiable
        )
    except ollama.ResponseError as e:
        logger.error("Error de Ollama al extraer parámetros: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error del modelo local: {e.error}",
        ) from e

    raw1 = resp1.message.content or ""
    logger.debug("Extracción raw: %s", raw1)

    params = _extract_json(raw1)

    # Si no hay JSON o el modelo indica que no es un viaje
    if params is None or params.get("error") == "no_trip":
        # El modelo respondió algo que no es un viaje — devolvemos respuesta directa
        try:
            resp_direct = client.chat(
                model=OLLAMA_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Eres un asistente de tráfico para Madrid. "
                            "Responde en español de forma breve y amigable."
                        ),
                    },
                    *extract_messages,
                ],
                options={"temperature": 0.7},
            )
            return ChatResponse(response=resp_direct.message.content or "¿En qué puedo ayudarte?")
        except Exception:
            return ChatResponse(response="No entendí bien tu consulta. ¿Puedes contarme más sobre tu viaje?")

    # Validación mínima de los campos extraídos
    if not params.get("destination") or not params.get("arrival_datetime"):
        return ChatResponse(
            response="Necesito saber al menos el destino y la hora de llegada. ¿Me puedes dar más detalles?"
        )

    # -----------------------------------------------------------------------
    # 2) Ejecutar pipeline de predicción LSTM
    # -----------------------------------------------------------------------
    try:
        prediction = _run_prediction(params)
    except (PredictionError, ValueError) as e:
        error_str = str(e)
        logger.warning("Predicción fallida params=%s: %s", params, error_str)
        return ChatResponse(
            response=(
                f"No pude calcular la ruta hacia '{params.get('destination')}'. "
                f"Motivo: {error_str}. "
                "Comprueba que las direcciones estén en Madrid y que la fecha sea válida."
            )
        )
    except Exception as e:
        logger.exception("Error inesperado en predicción")
        return ChatResponse(response="Hubo un error interno al calcular la ruta. Inténtalo de nuevo.")

    # -----------------------------------------------------------------------
    # 3) Generar explicación en lenguaje natural vía LLM
    # -----------------------------------------------------------------------
    prediction_text = json.dumps(prediction, ensure_ascii=False, indent=2)
    explain_user_msg = (
        f"El usuario preguntó: {req.message}\n\n"
        f"Datos de predicción de tráfico:\n{prediction_text}"
    )

    try:
        resp2 = client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": _explanation_system(today, req.home_address)},
                {"role": "user", "content": explain_user_msg},
            ],
            options={"temperature": 0.6},
        )
        final_text = resp2.message.content or ""
    except Exception as e:
        logger.warning("Error al generar explicación: %s", e)
        # Fallback sin LLM
        p = prediction
        final_text = (
            f"Para llegar a {p['destination']} a las {p['arrival_time']}, "
            f"te recomiendo salir a las **{p['departure_recommended']}**. "
            f"El trayecto dura aproximadamente {p['eta_minutes']} min "
            f"({p['distance_km']} km, {p['avg_speed_kmh']} km/h de media)."
        )
        if p["high_occupancy_sensors"]:
            final_text += (
                f" Hay {len(p['high_occupancy_sensors'])} zona(s) con ocupación elevada "
                "en ruta, es posible que encuentres algo de tráfico."
            )

    return ChatResponse(
        response=final_text,
        eta_minutes=prediction["eta_minutes"],
        departure_time=prediction["departure_recommended"],
        origin=prediction["origin"],
        destination=prediction["destination"],
        departure_datetime_iso=prediction["departure_datetime_iso"],
    )

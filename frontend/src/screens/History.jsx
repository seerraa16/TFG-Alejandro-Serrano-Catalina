import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Loader2, Map, Trash2, Zap, WifiOff, MapPin } from 'lucide-react'
import Header from '../components/Header'
import BottomNav from '../components/BottomNav'
import { chatAgent, predictETA } from '../api/traffic'
import { useSettings } from '../context/SettingsContext'

const STORAGE_KEY = 'pt_agent_messages'
const MAX_STORED = 40

const SUGGESTIONS = [
  '¿A qué hora tengo que salir para llegar al trabajo a las 9?',
  'Tengo una reunión mañana a las 10 en Nuevos Ministerios, ¿cuándo salgo?',
  '¿Cuánto tarda ir al aeropuerto T4 a las 7 de la mañana?',
  '¿Cómo está el tráfico el viernes hacia la A-6?',
]

function loadMessages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveMessages(msgs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_STORED)))
  } catch {}
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
        <Zap size={13} className="text-white" strokeWidth={2.5} />
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5 shadow-sm">
        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  )
}

const isOllamaError = (msg) =>
  msg.role === 'assistant' &&
  (msg.content?.toLowerCase().includes('ollama') ||
   msg.content?.toLowerCase().includes('503') ||
   msg.content?.toLowerCase().includes('no está disponible'))

function MessageBubble({ msg, onVerMapa, mapLoading }) {
  const isUser = msg.role === 'user'
  const hasRoute = !isUser && msg.origin && msg.destination && msg.departure_datetime_iso
  const isError = isOllamaError(msg)

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] bg-gray-900 text-white px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed shadow-sm">
          {msg.content}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
          <WifiOff size={13} className="text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
            <p className="text-sm font-semibold text-amber-800 mb-1">Agente no disponible</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              El asistente de IA necesita Ollama ejecutándose en tu máquina.
            </p>
            <code className="block mt-2 text-xs bg-amber-100 text-amber-900 px-2 py-1 rounded font-mono">
              ollama serve
            </code>
            <p className="text-[10px] text-amber-500 mt-2">
              Una vez iniciado, vuelve a enviar tu pregunta.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Zap size={13} className="text-white" strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm text-sm text-gray-800 leading-relaxed">
          {msg.content}

          {msg.eta_minutes && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
              {/* Origen → Destino */}
              {msg.origin && msg.destination && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <MapPin size={11} className="text-green-500 flex-shrink-0" />
                  <span className="truncate">{msg.origin}</span>
                  <span className="text-gray-300 flex-shrink-0">→</span>
                  <MapPin size={11} className="text-red-500 flex-shrink-0" />
                  <span className="truncate">{msg.destination}</span>
                </div>
              )}
              {/* ETA + hora de salida */}
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Duración</p>
                  <p className="text-base font-bold text-gray-900 mt-0.5">{Number(msg.eta_minutes).toFixed(0)} min</p>
                </div>
                {msg.departure_time && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Salir a las</p>
                    <p className="text-base font-bold text-blue-600 mt-0.5">{msg.departure_time}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {hasRoute && (
          <button
            onClick={() => onVerMapa(msg)}
            disabled={mapLoading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1.5 rounded-full active:scale-95 transition-all disabled:opacity-50"
          >
            {mapLoading
              ? <Loader2 size={11} className="animate-spin" />
              : <Map size={11} />
            }
            Ver en mapa
          </button>
        )}
      </div>
    </div>
  )
}

export default function AgentScreen() {
  const navigate = useNavigate()
  const { settings, weatherOverride } = useSettings()
  const [messages, setMessages] = useState(loadMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [mapLoadingId, setMapLoadingId] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { saveMessages(messages) }, [messages])
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const historyForApi = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    setInput('')
    setLoading(true)

    try {
      const data = await chatAgent({
        message: trimmed,
        homeAddress: settings.homeAddress || 'Madrid',
        history: historyForApi,
      })
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        eta_minutes: data.eta_minutes,
        departure_time: data.departure_time,
        origin: data.origin,
        destination: data.destination,
        departure_datetime_iso: data.departure_datetime_iso,
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Lo siento, hubo un error: ${err.message}`,
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function handleVerMapa(msg) {
    const id = msg.departure_datetime_iso
    setMapLoadingId(id)
    try {
      const result = await predictETA({
        origin: msg.origin,
        destination: msg.destination,
        datetime: msg.departure_datetime_iso,
        mode: 'osm',
        weatherOverride,
        useOsmSpeedLimits: settings.useOsmSpeedLimits,
      })
      navigate('/route', {
        state: { result, origin: msg.origin, destination: msg.destination, mode: 'osm', datetime: msg.departure_datetime_iso },
      })
    } catch (err) {
      console.error(err)
    } finally {
      setMapLoadingId(null)
    }
  }

  function handleClearHistory() {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-full" style={{ background: '#f8fafc' }}>
      <Header />

      {!isEmpty && (
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-100 flex-shrink-0">
          <span className="text-xs text-gray-400">{messages.length} mensajes</span>
          <button
            onClick={handleClearHistory}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 transition-colors"
          >
            <Trash2 size={11} />
            Limpiar
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-hide">
        {isEmpty ? (
          <div className="flex flex-col h-full">
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-5">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
                <Zap size={26} className="text-white" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">Asistente de tráfico</p>
                <p className="text-sm text-gray-400 mt-1.5 leading-relaxed max-w-[240px]">
                  Pregúntame cuándo salir, cuánto tardarás o cómo está el tráfico.
                </p>
              </div>
            </div>

            <div className="space-y-2 pb-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Sugerencias</p>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="w-full text-left bg-white border border-gray-100 rounded-xl px-4 py-3 text-sm text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-all active:scale-[0.98]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 pb-2">
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                msg={msg}
                onVerMapa={handleVerMapa}
                mapLoading={mapLoadingId === msg.departure_datetime_iso}
              />
            ))}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-gray-100 flex-shrink-0">
        <form
          onSubmit={e => { e.preventDefault(); sendMessage(input) }}
          className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 focus-within:border-blue-300 focus-within:bg-white transition-all"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Pregunta sobre tu trayecto…"
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 disabled:opacity-30 transition-all active:scale-95 flex-shrink-0"
          >
            {loading
              ? <Loader2 size={14} className="animate-spin" />
              : <Send size={14} strokeWidth={2.5} />
            }
          </button>
        </form>
      </div>

      <BottomNav />
    </div>
  )
}

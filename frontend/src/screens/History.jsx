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
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: 'linear-gradient(135deg, oklch(0.6 0.22 262), oklch(0.45 0.22 262))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px -2px oklch(0.5 0.22 262 / 0.5)' }}>
        <Zap size={12} color="#fff" strokeWidth={2.5} />
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 5, boxShadow: 'var(--shadow-sm)' }}>
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
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ maxWidth: '80%', background: 'var(--ink)', color: '#fff', padding: '10px 14px', borderRadius: '14px 14px 4px 14px', fontSize: 13, lineHeight: 1.45, boxShadow: 'var(--shadow-sm)' }}>
          {msg.content}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--warn)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
          <WifiOff size={12} color="#fff" strokeWidth={2.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: 'oklch(0.97 0.04 60)', border: '1px solid oklch(0.9 0.07 60)', borderRadius: '14px 14px 14px 4px', padding: '12px 14px', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'oklch(0.4 0.1 60)', marginBottom: 4, marginTop: 0 }}>Agente no disponible</p>
            <p style={{ fontSize: 12, color: 'oklch(0.5 0.1 60)', lineHeight: 1.5, margin: 0 }}>
              El asistente necesita Ollama ejecutándose en tu máquina.
            </p>
            <code style={{ display: 'block', marginTop: 8, fontSize: 11.5, background: 'oklch(0.93 0.06 60)', color: 'oklch(0.35 0.1 60)', padding: '4px 8px', borderRadius: 6, fontFamily: "'JetBrains Mono', monospace" }}>
              ollama serve
            </code>
            <p style={{ fontSize: 10.5, color: 'oklch(0.6 0.1 60)', marginTop: 8, marginBottom: 0 }}>
              Una vez iniciado, vuelve a enviar tu pregunta.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, marginTop: 2, background: 'linear-gradient(135deg, oklch(0.6 0.22 262), oklch(0.45 0.22 262))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px -2px oklch(0.5 0.22 262 / 0.5)' }}>
        <Zap size={12} color="#fff" strokeWidth={2.5} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', padding: '12px 14px', boxShadow: 'var(--shadow-sm)', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          {msg.content}

          {msg.eta_minutes && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-soft)' }}>
              {msg.origin && msg.destination && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 10, flexWrap: 'wrap' }}>
                  <MapPin size={11} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{msg.origin}</span>
                  <span style={{ color: 'var(--ink-4)', flexShrink: 0 }}>→</span>
                  <MapPin size={11} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{msg.destination}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 20, background: 'linear-gradient(135deg, oklch(0.28 0.04 262), oklch(0.16 0.03 258))', borderRadius: 12, padding: '10px 14px' }}>
                <div>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.5)', margin: 0 }}>DURACIÓN</p>
                  <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, color: '#fff', margin: '2px 0 0', lineHeight: 1 }}>{Number(msg.eta_minutes).toFixed(0)}<span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", opacity: 0.7, marginLeft: 3 }}>min</span></p>
                </div>
                {msg.departure_time && (
                  <>
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.15)' }} />
                    <div>
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.5)', margin: 0 }}>SALIR</p>
                      <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, color: '#fff', margin: '2px 0 0', lineHeight: 1 }}>{msg.departure_time}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {hasRoute && (
          <button
            onClick={() => onVerMapa(msg)}
            disabled={mapLoading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--primary)', background: 'var(--primary-tint)', border: 'none', padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', opacity: mapLoading ? 0.5 : 1 }}
          >
            {mapLoading ? <Loader2 size={11} className="animate-spin" /> : <Map size={11} />}
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
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <Header />

      {!isEmpty && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border-soft)', flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--ink-3)' }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--primary)', boxShadow: '0 0 0 3px oklch(0.5 0.22 262 / 0.18)' }} />
            {messages.length} mensajes en memoria
          </span>
          <button
            onClick={handleClearHistory}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 9px', fontSize: 11.5, color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Trash2 size={11} />
            Limpiar
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-hide">
        {isEmpty ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 24px', gap: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                background: 'linear-gradient(135deg, oklch(0.6 0.22 262), oklch(0.45 0.22 262))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 24px -6px oklch(0.5 0.22 262 / 0.5)',
              }}>
                <Zap size={22} color="#fff" strokeWidth={2.5} />
              </div>
              <div>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
                  Asistente · Madrid
                </p>
                <h1 style={{ fontWeight: 600, fontSize: 22, color: 'var(--ink)', letterSpacing: '-0.025em', margin: 0, lineHeight: 1.3 }}>
                  Pregúntale al tráfico
                </h1>
                <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.5, maxWidth: 240 }}>
                  Cuándo salir, cuánto tardarás o cómo está el tráfico.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0 }}>Sugerencias</p>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  style={{ width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)' }}
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

      {/* Compositor */}
      <div style={{ padding: '8px 12px 12px', background: 'linear-gradient(180deg, transparent, var(--bg) 35%)', borderTop: '1px solid var(--border-soft)', flexShrink: 0 }}>
        <form
          onSubmit={e => { e.preventDefault(); sendMessage(input) }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '6px 6px 6px 14px', boxShadow: 'var(--shadow-md)' }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Pregunta sobre tu trayecto…"
            disabled={loading}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14, color: 'var(--ink)', padding: '8px 0' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            style={{
              width: 36, height: 36, borderRadius: 10, border: 'none',
              background: 'var(--primary)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
              opacity: (!input.trim() || loading) ? 0.4 : 1,
              boxShadow: '0 4px 10px -3px oklch(0.5 0.22 262 / 0.55)',
              transition: 'opacity 120ms',
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} strokeWidth={2.5} />}
          </button>
        </form>
      </div>

      <BottomNav />
    </div>
  )
}

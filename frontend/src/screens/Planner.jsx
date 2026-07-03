import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { predictETA } from '../api/traffic'
import { useSettings } from '../context/SettingsContext'
import { useEvents } from '../context/EventsContext'
import Header from '../components/Header'
import BottomNav from '../components/BottomNav'
import {
  Clock, MapPin, Navigation, Plus, X,
  Loader, RefreshCw, CalendarDays, Bell,
} from 'lucide-react'

const ALERT_THRESHOLD_MIN = 10   // avisar si el ETA sube más de 10 min
const POLL_INTERVAL_MS   = 5 * 60 * 1000  // cada 5 minutos
const LOOKAHEAD_MS       = 2 * 60 * 60 * 1000  // sólo eventos en las próximas 2h

const MONTHS_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

function getMonthLabel(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`
}

function subMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number)
  const total = Math.max(0, h * 60 + m - mins)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export default function Planner() {
  const navigate = useNavigate()
  const { weatherOverride, settings } = useSettings()
  const { events, addEvent, removeEvent, connectGoogle, isGoogleConnected, googleLoading, googleError } = useEvents()

  const HOME = settings.homeAddress || 'Calle Valderrodrigo 31, Madrid'

  const [eventETAs, setEventETAs] = useState({})
  const [etaLoading, setEtaLoading] = useState({})
  const [loadingRoute, setLoadingRoute] = useState(null)
  const [routeErrors, setRouteErrors] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', date: '', eventTime: '', destination: '' })
  const [addError, setAddError] = useState('')
  const [trafficAlerts, setTrafficAlerts] = useState([])

  const fetchedKey = useRef('')
  const lastKnownETAs = useRef({})

  // Pide permiso de notificación al activar las alertas proactivas
  useEffect(() => {
    if (!settings.proactiveAlerts) return
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [settings.proactiveAlerts])

  const checkForTrafficChanges = useCallback(async () => {
    const now = new Date()
    const soonEvents = events.filter(e => {
      const dt = new Date(`${e.date}T${e.departureTime}:00`)
      return dt >= now && dt - now <= LOOKAHEAD_MS && e.destination
    })
    if (soonEvents.length === 0) return

    const newAlerts = []
    for (const event of soonEvents) {
      try {
        const dt = `${event.date}T${event.departureTime}:00`
        const res = await predictETA({
          origin: HOME,
          destination: event.destination,
          datetime: dt,
          mode: 'osm',
          weatherOverride,
          useOsmSpeedLimits: settings.useOsmSpeedLimits,
        })
        const newEta = res.eta_minutes
        const prevEta = lastKnownETAs.current[event.id]

        if (prevEta != null && newEta - prevEta >= ALERT_THRESHOLD_MIN) {
          const delta = Math.round(newEta - prevEta)
          const msg = `Más tráfico hacia "${event.title}": +${delta} min sobre lo previsto.`

          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Alerta de tráfico', { body: msg, icon: '/vite.svg' })
          } else {
            newAlerts.push({ id: `${event.id}_${Date.now()}`, msg })
          }
        }

        lastKnownETAs.current[event.id] = newEta
        setEventETAs(prev => ({ ...prev, [event.id]: newEta }))
      } catch {
        // ignorar errores en la comprobación de fondo
      }
    }

    if (newAlerts.length > 0) {
      setTrafficAlerts(prev => [...prev, ...newAlerts])
    }
  }, [events, HOME, weatherOverride, settings.useOsmSpeedLimits])

  // Polling cada 5 minutos cuando las alertas proactivas están activas
  useEffect(() => {
    if (!settings.proactiveAlerts) return
    const id = setInterval(checkForTrafficChanges, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [settings.proactiveAlerts, checkForTrafficChanges])
  const eventIds = events.map(e => e.id).join(',')

  useEffect(() => {
    const key = eventIds + HOME
    if (key === fetchedKey.current) return
    fetchedKey.current = key

    const loadingMap = {}
    events.forEach(e => { loadingMap[e.id] = true })
    setEtaLoading(loadingMap)

    const calc = async () => {
      const results = {}
      await Promise.allSettled(
        events.map(async (m) => {
          try {
            const dt = `${m.date}T${m.departureTime}:00`
            const res = await predictETA({
              origin: HOME,
              destination: m.destination,
              datetime: dt,
              mode: 'osm',
              weatherOverride,
              useOsmSpeedLimits: settings.useOsmSpeedLimits,
            })
            results[m.id] = res.eta_minutes
            lastKnownETAs.current[m.id] = res.eta_minutes
          } catch (err) {
            console.error(`[ETA] Fallo para "${m.title}"`, err)
            results[m.id] = null
          }
        })
      )
      setEventETAs(results)
      setEtaLoading({})
    }
    calc()
  }, [eventIds, HOME])

  const handleOpenRoute = async (event) => {
    setLoadingRoute(event.id)
    setRouteErrors(prev => { const n = { ...prev }; delete n[event.id]; return n })
    try {
      const dt = `${event.date}T${event.departureTime}:00`
      const result = await predictETA({
        origin: HOME,
        destination: event.destination,
        datetime: dt,
        mode: 'osm',
        weatherOverride,
        useOsmSpeedLimits: settings.useOsmSpeedLimits,
      })
      navigate('/route', {
        state: { result, origin: HOME, destination: event.destination, mode: 'osm', datetime: dt },
      })
    } catch (e) {
      console.error(e)
      setRouteErrors(prev => ({ ...prev, [event.id]: e.message || 'No se pudo calcular la ruta' }))
    } finally {
      setLoadingRoute(null)
    }
  }

  const handleAddEvent = () => {
    if (!newEvent.title.trim() || !newEvent.date || !newEvent.eventTime || !newEvent.destination.trim()) {
      setAddError('Rellena todos los campos obligatorios.')
      return
    }
    addEvent({
      title: newEvent.title.trim(),
      date: newEvent.date,
      eventTime: newEvent.eventTime,
      departureTime: subMinutes(newEvent.eventTime, 30),
      location: newEvent.destination.trim(),
      destination: newEvent.destination.trim().toLowerCase().includes('madrid')
        ? newEvent.destination.trim()
        : newEvent.destination.trim() + ', Madrid',
      status: null,
    })
    setNewEvent({ title: '', date: '', eventTime: '', destination: '' })
    setAddError('')
    setShowAddModal(false)
  }

  const upcomingEvents = events.filter(
    e => new Date(`${e.date}T${e.eventTime}`) >= new Date(new Date().setHours(0, 0, 0, 0))
  )
  const monthLabel = upcomingEvents.length > 0
    ? getMonthLabel(upcomingEvents[0].date)
    : getMonthLabel(new Date().toISOString().slice(0, 10))

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <Header
        subtitle={isGoogleConnected ? 'Google Calendar · sincronizado' : 'Google Calendar · no conectado'}
        rightAction={
          <button
            onClick={connectGoogle}
            disabled={googleLoading}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--bg-2)', border: '1px solid var(--border)',
              color: 'var(--ink-2)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
              opacity: googleLoading ? 0.4 : 1,
            }}
            title={isGoogleConnected ? 'Actualizar' : 'Conectar Google Calendar'}
          >
            <RefreshCw size={14} className={googleLoading ? 'animate-spin' : ''} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-hide" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {googleError && (
          <div style={{ background: 'oklch(0.97 0.04 22)', border: '1px solid oklch(0.92 0.06 22)', borderRadius: 14, padding: '10px 14px', fontSize: 12, color: 'var(--danger)' }}>
            {googleError}
          </div>
        )}

        {trafficAlerts.map(alert => (
          <div key={alert.id} style={{ background: 'oklch(0.97 0.04 60)', border: '1px solid oklch(0.9 0.07 60)', borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Bell size={14} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: 'oklch(0.45 0.1 60)', flex: 1, lineHeight: 1.5, margin: 0 }}>{alert.msg}</p>
            <button
              onClick={() => setTrafficAlerts(prev => prev.filter(a => a.id !== alert.id))}
              style={{ color: 'var(--warn)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          </div>
        ))}

        {!isGoogleConnected && (
          <button
            onClick={connectGoogle}
            disabled={googleLoading}
            style={{
              width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '10px 0', fontSize: 13, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: 'pointer', color: 'var(--ink-3)',
              opacity: googleLoading ? 0.5 : 1, fontFamily: 'inherit',
            }}
          >
            {googleLoading
              ? <Loader size={15} className="animate-spin" style={{ color: 'var(--ink-3)' }} />
              : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" style={{ width: 16, height: 16 }} />
            }
            {googleLoading ? 'Importando eventos...' : 'Importar desde Google Calendar'}
          </button>
        )}

        {/* Crear evento */}
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            width: '100%', height: 50, borderRadius: 14, border: 'none',
            background: 'var(--primary)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 9, cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
            letterSpacing: '-0.005em',
          }}
        >
          <Plus size={17} strokeWidth={1.8} />
          Crear evento
        </button>

        {/* Encabezado lista */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Próximos eventos</span>
          </div>
          <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 14, color: 'var(--ink-3)', letterSpacing: '-0.01em' }}>{monthLabel}</span>
        </div>

        {upcomingEvents.length === 0 ? (
          <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-2)', margin: 0 }}>No tienes eventos esta semana</p>
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }}>Añade uno para ver cuánto tardarás en llegar</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcomingEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                eta={eventETAs[event.id]}
                etaLoading={!!etaLoading[event.id]}
                loadingRoute={loadingRoute === event.id}
                routeError={routeErrors[event.id]}
                onOpenRoute={() => handleOpenRoute(event)}
                onRemove={() => removeEvent(event.id)}
              />
            ))}
          </div>
        )}

        <div className="h-2" />
      </div>

      {/* Modal añadir evento */}
      {showAddModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
          onClick={e => e.target === e.currentTarget && setShowAddModal(false)}
        >
          <div style={{ background: 'var(--surface)', width: '100%', borderRadius: '24px 24px 0 0', padding: 24, maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 999, margin: '-4px auto 0' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)', margin: 0, letterSpacing: '-0.015em' }}>Nuevo evento</h2>
              <button
                onClick={() => { setShowAddModal(false); setAddError('') }}
                style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--bg-2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)' }}
              >
                <X size={15} />
              </button>
            </div>

            <input
              type="text"
              placeholder="Título del evento *"
              value={newEvent.title}
              onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg-2)', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: 'var(--ink-3)', marginBottom: 6, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Fecha *</p>
                <input
                  type="date"
                  value={newEvent.date}
                  onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg-2)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: 'var(--ink-3)', marginBottom: 6, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Hora *</p>
                <input
                  type="time"
                  value={newEvent.eventTime}
                  onChange={e => setNewEvent(p => ({ ...p, eventTime: e.target.value }))}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg-2)', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: 'var(--ink-3)', marginBottom: 6, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Dirección *</p>
              <input
                type="text"
                placeholder="Ej: Calle Gran Vía, 10, Madrid"
                value={newEvent.destination}
                onChange={e => setNewEvent(p => ({ ...p, destination: e.target.value }))}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg-2)', boxSizing: 'border-box' }}
              />
            </div>

            {addError && (
              <p style={{ fontSize: 12, color: 'var(--danger)', background: 'oklch(0.97 0.04 22)', padding: '10px 14px', borderRadius: 10, margin: 0 }}>{addError}</p>
            )}

            <button
              onClick={handleAddEvent}
              style={{
                width: '100%', height: 50, borderRadius: 14, border: 'none',
                background: 'var(--primary)',
                color: '#fff', fontWeight: 600, fontSize: 15, fontFamily: 'inherit',
                cursor: 'pointer', letterSpacing: '-0.005em',
              }}
            >
              Guardar evento
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

function EventCard({ event, eta, etaLoading, loadingRoute, routeError, onOpenRoute, onRemove }) {
  const isGoogle = event.status === 'GOOGLE'
  const noLocation = isGoogle && !event.hasLocation

  return (
    <article style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 14px 12px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* Badge día */}
        <div style={{ width: 50, minHeight: 56, borderRadius: 12, background: 'var(--primary-tint)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--primary)', fontWeight: 500, lineHeight: 1, margin: 0 }}>{event.dayLabel}</p>
          <p style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: 22, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--primary)', marginTop: 4, marginBottom: 0 }}>{event.dayNum}</p>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.25, letterSpacing: '-0.01em' }}>{event.title}</span>
            {!isGoogle && (
              <button
                onClick={onRemove}
                style={{ width: 22, height: 22, borderRadius: 6, background: 'transparent', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-2)' }}>
              <Clock size={11} strokeWidth={2} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{event.eventTime}</span>
            </div>
            <span style={{ width: 1, height: 10, background: 'var(--border)' }} />
            {isGoogle ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, background: 'var(--primary-tint)', color: 'var(--primary)', padding: '2px 7px', borderRadius: 999, fontWeight: 500 }}>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" style={{ width: 10, height: 10 }} />
                Google
              </span>
            ) : event.status ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, background: 'var(--success-tint)', color: 'var(--success)', padding: '3px 8px 3px 6px', borderRadius: 999, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {event.status}
              </span>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, color: 'var(--ink-2)', fontSize: 12.5 }}>
            <MapPin size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.location}</span>
          </div>
        </div>
      </div>

      {/* ETA strip */}
      {!noLocation && (
        <div style={{ borderTop: '1px solid var(--border-soft)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 9, letterSpacing: '0.06em', color: 'var(--ink-3)', fontWeight: 600 }}>VIAJE</span>
              {etaLoading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-3)', marginTop: 2 }}>
                  <Loader size={10} className="animate-spin" />
                  <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 11 }}>calculando…</span>
                </span>
              ) : eta != null ? (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: 'var(--ink)', fontWeight: 600, marginTop: 2 }}>{eta.toFixed(0)} min</span>
              ) : (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-4)', marginTop: 2 }}>—</span>
              )}
            </div>
            <button
              onClick={onOpenRoute}
              disabled={loadingRoute || etaLoading}
              style={{
                marginLeft: 'auto',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'var(--primary)', color: '#fff', border: 'none',
                height: 30, padding: '0 12px', borderRadius: 9, fontSize: 12, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 10px -3px oklch(0.45 0.18 142 / 0.5)',
                opacity: (loadingRoute || etaLoading) ? 0.5 : 1,
              }}
            >
              {loadingRoute
                ? <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: 999, animation: 'spin 0.8s linear infinite' }} />
                : <Navigation size={11} strokeWidth={2.5} />
              }
              Calcular ruta
            </button>
          </div>
          {routeError && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--danger)', lineHeight: 1.4 }}>{routeError}</p>
          )}
        </div>
      )}
    </article>
  )
}

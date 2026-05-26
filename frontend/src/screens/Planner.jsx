import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { predictETA } from '../api/traffic'
import { useSettings } from '../context/SettingsContext'
import { useEvents } from '../context/EventsContext'
import Header from '../components/Header'
import BottomNav from '../components/BottomNav'
import {
  Clock, MapPin, Navigation, Plus, X,
  Loader, Search, RefreshCw, CalendarDays, Bell,
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
    <div className="flex flex-col h-full" style={{ background: '#f8fafc' }}>
      {/* Header propio del Planner */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-200">
            <CalendarDays size={17} className="text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-[15px] leading-tight">Planificador</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isGoogleConnected ? 'bg-green-400' : 'bg-gray-300'}`} />
              <span className="text-[11px] text-gray-400 leading-none">
                {isGoogleConnected ? 'Google Calendar · Conectado' : 'Google Calendar · No conectado'}
              </span>
            </div>
          </div>
          <button
            onClick={connectGoogle}
            disabled={googleLoading}
            className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-40"
            title={isGoogleConnected ? 'Actualizar' : 'Conectar Google Calendar'}
          >
            <RefreshCw size={14} className={`text-gray-400 ${googleLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-hide">

        {googleError && (
          <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-xs text-red-500">
            {googleError}
          </div>
        )}

        {trafficAlerts.map(alert => (
          <div key={alert.id} className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
            <Bell size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 flex-1 leading-relaxed">{alert.msg}</p>
            <button
              onClick={() => setTrafficAlerts(prev => prev.filter(a => a.id !== alert.id))}
              className="text-amber-400 hover:text-amber-600 flex-shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        ))}

        {!isGoogleConnected && (
          <button
            onClick={connectGoogle}
            disabled={googleLoading}
            className="w-full bg-white border border-gray-200 py-3 rounded-2xl text-sm flex items-center justify-center gap-2 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50 text-gray-600 font-medium"
          >
            {googleLoading
              ? <Loader size={15} className="animate-spin text-gray-400" />
              : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-4 h-4" />
            }
            {googleLoading ? 'Importando eventos...' : 'Importar desde Google Calendar'}
          </button>
        )}

        {/* Crear evento */}
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full bg-blue-600 text-white py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-100 active:scale-[0.98] transition-all hover:bg-blue-700"
        >
          <Plus size={18} strokeWidth={2.5} />
          Crear evento
        </button>

        {/* Buscador */}
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-2">
          <Search size={14} className="text-gray-300 flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar evento o ubicación"
            className="flex-1 text-sm text-gray-600 placeholder-gray-300 focus:outline-none bg-transparent"
          />
        </div>

        {/* Encabezado lista */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Próximos eventos</span>
          <span className="text-xs text-gray-400">{monthLabel}</span>
        </div>

        {upcomingEvents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-10 text-center">
            <CalendarDays size={36} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-400">Sin eventos próximos</p>
            <p className="text-xs text-gray-300 mt-1">Pulsa "Crear evento" para añadir uno</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {upcomingEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                eta={eventETAs[event.id]}
                etaLoading={!!etaLoading[event.id]}
                loadingRoute={loadingRoute === event.id}
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
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end"
          onClick={e => e.target === e.currentTarget && setShowAddModal(false)}
        >
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-w-[430px] mx-auto">
            {/* Handle */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto -mt-2" />

            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-base">Nuevo evento</h2>
              <button
                onClick={() => { setShowAddModal(false); setAddError('') }}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <X size={15} className="text-gray-500" />
              </button>
            </div>

            <input
              type="text"
              placeholder="Título del evento *"
              value={newEvent.title}
              onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all placeholder-gray-300"
            />

            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[10px] text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">Fecha *</p>
                <input
                  type="date"
                  value={newEvent.date}
                  onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">Hora *</p>
                <input
                  type="time"
                  value={newEvent.eventTime}
                  onChange={e => setNewEvent(p => ({ ...p, eventTime: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                />
              </div>
            </div>

            <div>
              <p className="text-[10px] text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">Dirección *</p>
              <input
                type="text"
                placeholder="Ej: Calle Gran Vía, 10, Madrid"
                value={newEvent.destination}
                onChange={e => setNewEvent(p => ({ ...p, destination: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all placeholder-gray-300"
              />
            </div>

            {addError && (
              <p className="text-xs text-red-500 bg-red-50 px-3.5 py-2.5 rounded-xl">{addError}</p>
            )}

            <button
              onClick={handleAddEvent}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all shadow-md shadow-blue-100"
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

function EventCard({ event, eta, etaLoading, loadingRoute, onOpenRoute, onRemove }) {
  const isGoogle = event.status === 'GOOGLE'
  const noLocation = isGoogle && !event.hasLocation

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="p-3.5 flex gap-3 items-start">
        {/* Badge día */}
        <div className="bg-blue-600 text-white rounded-xl px-2.5 py-2 text-center flex-shrink-0 min-w-[46px]">
          <p className="text-[9px] font-bold leading-none uppercase tracking-wide opacity-80">{event.dayLabel}</p>
          <p className="text-2xl font-bold leading-none mt-0.5">{event.dayNum}</p>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-gray-900 leading-snug">{event.title}</span>
            {!isGoogle && (
              <button
                onClick={onRemove}
                className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors flex-shrink-0"
              >
                <X size={12} className="text-gray-300 hover:text-red-400" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <div className="flex items-center gap-1 text-gray-500">
              <Clock size={10} strokeWidth={2} />
              <span className="text-xs">{event.eventTime}</span>
            </div>
            {isGoogle ? (
              <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-2.5 h-2.5" />
                Google
              </span>
            ) : event.status ? (
              <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">
                {event.status}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1 text-gray-400 mt-1">
            <MapPin size={10} strokeWidth={2} className="flex-shrink-0" />
            <span className="text-xs truncate">{event.location}</span>
          </div>
        </div>
      </div>

      {/* Footer con ETA + botón */}
      {!noLocation && (
        <div className="border-t border-gray-50 px-3.5 py-2.5 flex items-center justify-between gap-3 bg-gray-50/50">
          <div className="text-xs text-gray-500">
            {etaLoading ? (
              <span className="flex items-center gap-1.5 text-gray-400">
                <Loader size={10} className="animate-spin" />
                Calculando tiempo…
              </span>
            ) : eta != null ? (
              <span>
                Desde casa: <span className="font-semibold text-gray-800">{eta.toFixed(0)} min</span>
              </span>
            ) : (
              <span className="text-gray-300">Sin datos de tiempo</span>
            )}
          </div>
          <button
            onClick={onOpenRoute}
            disabled={loadingRoute || etaLoading}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-xl active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
          >
            {loadingRoute
              ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Navigation size={11} strokeWidth={2.5} />
            }
            Calcular ruta
          </button>
        </div>
      )}
    </div>
  )
}

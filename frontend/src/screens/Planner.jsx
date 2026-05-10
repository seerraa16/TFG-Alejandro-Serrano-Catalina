import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { predictETA } from '../api/traffic'
import { useSettings } from '../context/SettingsContext'
import { useEvents } from '../context/EventsContext'
import BottomNav from '../components/BottomNav'
import {
  Calendar, Clock, MapPin, Navigation, Plus, X,
  Loader, Search, RefreshCw,
} from 'lucide-react'

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
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
  const { events, addEvent, removeEvent } = useEvents()

  const HOME = settings.homeAddress || 'Calle Valderrodrigo 31, Madrid'

  const [eventETAs, setEventETAs] = useState({})
  const [etaLoading, setEtaLoading] = useState({})
  const [loadingRoute, setLoadingRoute] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', date: '', eventTime: '', destination: '' })
  const [addError, setAddError] = useState('')

  const fetchedKey = useRef('')
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
          } catch {
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
    <div className="flex flex-col h-full bg-dots">
      {/* Planner header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Calendar size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm leading-tight">Planificador de Calendario</p>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <p className="text-[11px] text-gray-400 leading-tight">Google Calendar · Conectado</p>
            </div>
          </div>
          <button className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors flex-shrink-0">
            <RefreshCw size={15} className="text-gray-500" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide pb-4">

        {/* Crear evento */}
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full bg-blue-600 text-white py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 shadow-sm shadow-blue-200 active:scale-[0.98] transition-all"
        >
          <Plus size={18} />
          Crear evento
        </button>

        {/* Buscador */}
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-2">
          <Search size={15} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Añadir ubicación o cita"
            className="flex-1 text-sm text-gray-600 focus:outline-none bg-transparent"
          />
        </div>

        {/* Próximos eventos */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-blue-600" />
              <span className="font-semibold text-gray-800 text-sm">Próximos eventos</span>
            </div>
            <span className="text-xs text-gray-400 font-medium">{monthLabel}</span>
          </div>

          {upcomingEvents.length === 0 ? (
            <div className="py-6 text-center">
              <Calendar size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No hay eventos próximos</p>
              <p className="text-xs text-gray-300 mt-0.5">Pulsa "Crear evento" para añadir uno</p>
            </div>
          ) : (
            <div className="space-y-3">
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
        </div>

        <div className="h-2" />
      </div>

      {/* Modal añadir evento */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={e => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-w-[430px] mx-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-base">Nuevo evento</h2>
              <button
                onClick={() => { setShowAddModal(false); setAddError('') }}
                className="p-1.5 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            <input
              type="text"
              placeholder="Título del evento *"
              value={newEvent.title}
              onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition-colors"
            />

            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wider">Fecha *</p>
                <input
                  type="date"
                  value={newEvent.date}
                  onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wider">Hora *</p>
                <input
                  type="time"
                  value={newEvent.eventTime}
                  onChange={e => setNewEvent(p => ({ ...p, eventTime: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
            </div>

            <div>
              <p className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wider">Dirección *</p>
              <input
                type="text"
                placeholder="Ej: Calle Gran Vía, 10, Madrid"
                value={newEvent.destination}
                onChange={e => setNewEvent(p => ({ ...p, destination: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition-colors"
              />
            </div>

            {addError && (
              <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{addError}</p>
            )}

            <button
              onClick={handleAddEvent}
              className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all"
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
  return (
    <div className="border border-gray-100 rounded-xl p-3 hover:border-blue-100 transition-colors">
      <div className="flex gap-3 items-start">
        {/* Day badge */}
        <div className="bg-blue-600 text-white rounded-xl px-2.5 py-1.5 text-center flex-shrink-0 min-w-[46px]">
          <p className="text-[9px] font-bold leading-none mb-0.5 uppercase">{event.dayLabel}</p>
          <p className="text-xl font-bold leading-none">{event.dayNum}</p>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{event.title}</span>
            {event.status && (
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                {event.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-xs text-blue-500 mt-1">
            <Clock size={10} />
            <span>{event.eventTime}</span>
          </div>

          <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
            <MapPin size={10} />
            <span className="truncate">{event.location}</span>
          </div>

          <div className="mt-1.5">
            {etaLoading ? (
              <span className="text-[11px] text-gray-400 flex items-center gap-1">
                <Loader size={10} className="animate-spin" />
                Calculando tiempo...
              </span>
            ) : eta != null ? (
              <span className="text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full inline-block">
                Si sales de casa, tardarías: {eta.toFixed(0)} min
              </span>
            ) : (
              <span className="text-[11px] text-gray-300">Tiempo no disponible</span>
            )}
          </div>
        </div>

        <button
          onClick={onRemove}
          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0 -mt-0.5"
          title="Eliminar evento"
        >
          <X size={13} className="text-gray-300 hover:text-red-400" />
        </button>
      </div>

      <button
        onClick={onOpenRoute}
        disabled={loadingRoute}
        className="w-full mt-3 border border-blue-200 text-blue-600 py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 hover:bg-blue-50 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {loadingRoute ? (
          <>
            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Calculando...
          </>
        ) : (
          <>
            <Navigation size={13} />
            Calcular ruta
          </>
        )}
      </button>
    </div>
  )
}

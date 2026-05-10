import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { predictETA } from '../api/traffic'
import { useSettings } from '../context/SettingsContext'
import Header from '../components/Header'
import BottomNav from '../components/BottomNav'
import {
  MapPin, Clock, Calendar, Navigation, AlertTriangle,
  ChevronRight, Layers, Loader,
} from 'lucide-react'

const HOME = 'Calle Valderrodrigo 31, Madrid'

const MEETINGS = [
  {
    id: 1,
    dayLabel: 'JUE',
    dayNum: '12',
    title: 'Reunión de Equipo',
    time: '09:15 AM – 10:30 AM',
    departureTime: '08:45',
    location: 'Distrito Telefónica, Edificio Oeste 1',
    destination: 'Distrito Telefónica, Las Tablas, Madrid',
    date: '2026-10-12',
    status: 'CONFIRMADO',
  },
  {
    id: 2,
    dayLabel: null,
    dayNum: null,
    title: 'Comida con Proveedores',
    time: '14:00 PM',
    departureTime: '13:30',
    location: 'Restaurante El Viso, Madrid',
    destination: 'Restaurante El Viso, Madrid',
    date: '2026-10-12',
    status: null,
  },
]

export default function Planner() {
  const navigate = useNavigate()
  const { weatherOverride, settings } = useSettings()

  const [origin, setOrigin] = useState(HOME)
  const [destination, setDestination] = useState('')
  const [date, setDate] = useState('2026-10-12')
  const [time, setTime] = useState('09:00')
  const [mode, setMode] = useState('osm')
  const [accidente, setAccidente] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // ETAs pre-calculados para cada evento
  const [eventETAs, setEventETAs] = useState({})
  const [etaLoading, setEtaLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const calcETAs = async () => {
      const results = {}
      await Promise.allSettled(
        MEETINGS.map(async (m) => {
          try {
            const dt = `${m.date}T${m.departureTime}:00`
            const res = await predictETA({
              origin: HOME,
              destination: m.destination,
              datetime: dt,
              mode: 'osm',
              weatherOverride,
              useOsmSpeedLimits: settings.useOsmSpeedLimits, // [OSM-SPEED]
            })
            results[m.id] = res.eta_minutes
          } catch {
            results[m.id] = null
          }
        })
      )
      if (!cancelled) {
        setEventETAs(results)
        setEtaLoading(false)
      }
    }
    calcETAs()
    return () => { cancelled = true }
  }, [])

  const handleSelectMeeting = (meeting) => {
    setDestination(meeting.destination)
    setDate(meeting.date)
    setTime(meeting.departureTime)
    setError(null)
  }

  const handleOpenRoute = async (meeting) => {
    // Abrir directamente en la pantalla RUTA con el resultado calculado
    setLoading(true)
    setError(null)
    try {
      const dt = `${meeting.date}T${meeting.departureTime}:00`
      const result = await predictETA({
        origin: HOME,
        destination: meeting.destination,
        datetime: dt,
        mode,
        accidente,
        weatherOverride,
        useOsmSpeedLimits: settings.useOsmSpeedLimits, // [OSM-SPEED]
      })
      navigate('/route', {
        state: { result, origin: HOME, destination: meeting.destination, mode },
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCalculate = async () => {
    if (!origin.trim() || !destination.trim()) {
      setError('Introduce un origen y un destino.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const dt = `${date}T${time}:00`
      const result = await predictETA({
        origin,
        destination,
        datetime: dt,
        mode,
        accidente,
        weatherOverride,
        useOsmSpeedLimits: settings.useOsmSpeedLimits, // [OSM-SPEED]
      })
      navigate('/route', { state: { result, origin, destination, dt, mode } })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-dots">
      <Header />

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide pb-4">

        {/* Origen / Destino */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex gap-3 items-stretch">
            <div className="flex flex-col items-center pt-5 pb-2 flex-shrink-0">
              <div className="w-3 h-3 rounded-full bg-blue-600" />
              <div className="w-px flex-1 bg-gray-200 my-1.5" style={{ minHeight: 20 }} />
              <div className="w-3 h-3 rounded-full border-2 border-gray-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div>
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Origen</label>
                <input
                  type="text"
                  value={origin}
                  onChange={e => setOrigin(e.target.value)}
                  className="w-full text-sm text-gray-800 py-1 focus:outline-none"
                />
              </div>
              <div className="border-t border-gray-100" />
              <div>
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Destino</label>
                <input
                  type="text"
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  className="w-full text-sm text-gray-800 py-1 focus:outline-none"
                  placeholder="¿A dónde vas?"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Salida */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={15} className="text-blue-600" />
            <span className="font-semibold text-gray-800 text-sm">Salida</span>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <p className="text-[10px] text-gray-400 mb-1.5">Fecha</p>
              <div className="flex items-center gap-1.5">
                <Calendar size={13} className="text-gray-400 flex-shrink-0" />
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="text-sm text-gray-700 focus:outline-none w-full" />
              </div>
            </div>
            <div className="w-px bg-gray-100" />
            <div className="flex-1">
              <p className="text-[10px] text-gray-400 mb-1.5">Hora</p>
              <div className="flex items-center gap-1.5">
                <Clock size={13} className="text-gray-400 flex-shrink-0" />
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  className="text-sm text-gray-700 focus:outline-none w-full" />
              </div>
            </div>
          </div>
          <p className="text-xs text-blue-500 italic mt-3 leading-relaxed">
            La predicción se ajustará automáticamente según el histórico de tráfico.
          </p>
        </div>

        {/* Modo de ruta */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers size={15} className="text-blue-600" />
            <span className="font-semibold text-gray-800 text-sm">Modo de Ruta</span>
          </div>
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button onClick={() => setMode('osm')}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${mode === 'osm' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
              🛣️ Red Vial (OSM)
            </button>
            <button onClick={() => setMode('sensors')}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${mode === 'sensors' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
              📡 Sensores
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            {mode === 'osm' ? 'Ruta real por la red vial de Madrid (recomendado).' : 'Dijkstra sobre el grafo de sensores DGT.'}
          </p>
        </div>

        {/* Próximos eventos */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-blue-600" />
              <span className="font-semibold text-gray-800 text-sm">Próximos eventos</span>
            </div>
            <button className="text-blue-600 text-xs font-medium">Ver calendario</button>
          </div>

          {/* Evento principal — click rellena el formulario, click en flecha abre ruta */}
          <div className="border border-gray-100 rounded-xl p-3">
            <div className="flex gap-3 items-start">
              <div className="bg-blue-600 text-white rounded-xl px-2.5 py-1.5 text-center flex-shrink-0">
                <p className="text-[9px] font-bold leading-none mb-0.5">{MEETINGS[0].dayLabel}</p>
                <p className="text-xl font-bold leading-none">{MEETINGS[0].dayNum}</p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">{MEETINGS[0].title}</span>
                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">CONFIRMADO</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-blue-500 mt-1">
                  <Clock size={10} />
                  <span>{MEETINGS[0].time}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                  <MapPin size={10} />
                  <span className="truncate">{MEETINGS[0].location}</span>
                </div>
                {/* ETA pre-calculado */}
                <div className="flex items-center gap-1 mt-1.5">
                  {etaLoading ? (
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      <Loader size={10} className="animate-spin" /> Calculando tiempo...
                    </span>
                  ) : eventETAs[MEETINGS[0].id] != null ? (
                    <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      ⏱️ ~{eventETAs[MEETINGS[0].id].toFixed(0)} min desde casa
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400">Tiempo no disponible</span>
                  )}
                </div>
              </div>
              {/* Botón abrir ruta */}
              <button
                onClick={() => handleOpenRoute(MEETINGS[0])}
                className="flex-shrink-0 p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors active:scale-95"
                title="Ver ruta completa"
              >
                <Navigation size={16} className="text-blue-600" />
              </button>
            </div>
          </div>

          {/* Botón calcular */}
          <button
            onClick={handleCalculate}
            disabled={loading || !destination.trim()}
            className="w-full mt-3 bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all shadow-sm shadow-blue-200"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Calculando ruta...
              </>
            ) : (
              <>
                <Navigation size={16} />
                Calcular ruta
              </>
            )}
          </button>

          {error && (
            <div className="mt-2 p-2.5 bg-red-50 text-red-600 text-xs rounded-xl flex items-start gap-2">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Aviso tráfico */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
          <span className="text-xs text-amber-700">Tráfico moderado previsto para mañana a esta hora</span>
        </div>

        {/* Segundo evento */}
        <button
          onClick={() => handleSelectMeeting(MEETINGS[1])}
          className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between hover:bg-gray-50 active:scale-[0.99] transition-all"
        >
          <div className="text-left flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">{MEETINGS[1].title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{MEETINGS[1].time} · {MEETINGS[1].location}</p>
            {!etaLoading && eventETAs[MEETINGS[1].id] != null && (
              <span className="text-[11px] font-semibold text-blue-600">
                ⏱️ ~{eventETAs[MEETINGS[1].id].toFixed(0)} min desde casa
              </span>
            )}
          </div>
          <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
        </button>

        {/* Toggle incidente */}
        <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">Simular incidente</p>
            <p className="text-xs text-gray-400 mt-0.5">Penaliza todos los sensores de la ruta</p>
          </div>
          <button
            onClick={() => setAccidente(v => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${accidente ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${accidente ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        <div className="h-2" />
      </div>

      <BottomNav />
    </div>
  )
}
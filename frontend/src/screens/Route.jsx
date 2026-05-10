import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { MapContainer, TileLayer, Polyline, Marker, CircleMarker, Popup } from 'react-leaflet'
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import { predictETA } from '../api/traffic'
import { useSettings } from '../context/SettingsContext'
import Header from '../components/Header'
import BottomNav from '../components/BottomNav'
import {
  Search, MapPin, Clock, Calendar, Layers,
  Navigation, Gauge, AlertTriangle, CloudRain,
  Thermometer, ChevronDown, RotateCcw,
} from 'lucide-react'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

const originIcon = L.divIcon({
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#16a34a;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
  iconSize: [16, 16], iconAnchor: [8, 8], className: '',
})
const destIcon = L.divIcon({
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#dc2626;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
  iconSize: [16, 16], iconAnchor: [8, 8], className: '',
})

function sensorColor(carga) {
  const p = carga <= 1.0 ? carga * 100 : carga
  if (p < 33) return { hex: '#16a34a', bg: 'bg-green-100', text: 'text-green-700', label: 'Fluido' }
  if (p < 66) return { hex: '#d97706', bg: 'bg-amber-100', text: 'text-amber-700', label: 'Moderado' }
  return { hex: '#dc2626', bg: 'bg-red-100', text: 'text-red-700', label: 'Denso' }
}

function rainLabel(ord) {
  return ['Sin lluvia', 'Lluvia leve', 'Lluvia moderada', 'Lluvia intensa'][ord] ?? 'Sin lluvia'
}

function fmtProb(v) {
  if (v == null) return '–'
  return v <= 1.0 ? `${(v * 100).toFixed(0)}%` : `${v.toFixed(0)}%`
}

export default function Route() {
  const navState = useLocation().state
  const { weatherOverride, settings } = useSettings()

  const [origin, setOrigin] = useState(() => settings?.homeAddress || 'Calle Valderrodrigo 31, Madrid')
  const [destination, setDestination] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState('09:00')
  const [mode, setMode] = useState('osm')
  const [savedDatetime, setSavedDatetime] = useState(null)
  const [accidente, setAccidente] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [showForm, setShowForm] = useState(true)

  // Si venimos del Planner con un resultado, cargarlo directamente
  useEffect(() => {
    if (navState?.result) {
      setResult(navState.result)
      setOrigin(navState.origin ?? origin)
      setDestination(navState.destination ?? '')
      setMode(navState.mode ?? 'osm')
      setSavedDatetime(navState.datetime ?? null)
      setShowForm(false)
    }
  }, [navState])

  const handleToggleMode = async (newMode) => {
    if (newMode === mode || loading) return
    setMode(newMode)
    setLoading(true)
    setError(null)
    try {
      const dt = savedDatetime ?? `${date}T${time}:00`
      const res = await predictETA({
        origin,
        destination,
        datetime: dt,
        mode: newMode,
        accidente,
        weatherOverride,
        useOsmSpeedLimits: settings.useOsmSpeedLimits,
      })
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!origin.trim() || !destination.trim()) {
      setError('Introduce origen y destino.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const dt = `${date}T${time}:00`
      const res = await predictETA({
        origin,
        destination,
        datetime: dt,
        mode,
        accidente,
        weatherOverride,
      })
      setResult(res)
      setShowForm(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const geometry = result?.geometry ?? []
  const center = geometry.length > 0 ? geometry[Math.floor(geometry.length / 2)] : [40.4168, -3.7038]
  const sensors = result?.sensor_predictions ?? []
  const weather = result?.weather
  const rs = result?.route_summary

  const avgCarga = sensors.length > 0
    ? sensors.reduce((s, p) => s + p.carga, 0) / sensors.length
    : 0
  const traffic = sensorColor(avgCarga)

  return (
    <div className="flex flex-col h-full bg-dots">
      <Header />

      <div className="flex-1 overflow-y-auto scrollbar-hide">

        {/* Formulario de búsqueda */}
        {showForm ? (
          <div className="px-4 py-3 space-y-3">

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

            {/* Fecha y hora */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={15} className="text-blue-600" />
                <span className="font-semibold text-gray-800 text-sm">Hora de salida</span>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-[10px] text-gray-400 mb-1.5">Fecha</p>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-gray-400" />
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                      className="text-sm text-gray-700 focus:outline-none w-full" />
                  </div>
                </div>
                <div className="w-px bg-gray-100" />
                <div className="flex-1">
                  <p className="text-[10px] text-gray-400 mb-1.5">Hora</p>
                  <div className="flex items-center gap-1.5">
                    <Clock size={13} className="text-gray-400" />
                    <input type="time" value={time} onChange={e => setTime(e.target.value)}
                      className="text-sm text-gray-700 focus:outline-none w-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* Modo grafo */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers size={15} className="text-blue-600" />
                <span className="font-semibold text-gray-800 text-sm">Modo de Ruta</span>
              </div>
              <div className="flex bg-gray-100 rounded-xl p-1">
                <button onClick={() => setMode('osm')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${mode === 'osm' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
                  🛣️ Red Vial (OSM)
                </button>
                <button onClick={() => setMode('sensors')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${mode === 'sensors' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
                  📡 Sensores
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                {mode === 'osm' ? 'Ruta real por la red vial de Madrid (recomendado).' : 'Dijkstra sobre el grafo de sensores DGT.'}
              </p>
            </div>

            {/* Opciones extra */}
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

            {/* Info settings activos */}
            {!settings.weatherData && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-2">
                <CloudRain size={14} className="text-blue-400 flex-shrink-0" />
                <span className="text-xs text-blue-600">Datos meteorológicos desactivados en ajustes — usando condiciones neutras.</span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                <span className="text-xs text-red-600">{error}</span>
              </div>
            )}

            {/* Botón buscar */}
            <button
              onClick={handleSearch}
              disabled={loading || !destination.trim()}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all shadow-md shadow-blue-200"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Calculando ruta...
                </>
              ) : (
                <>
                  <Search size={17} />
                  Buscar ruta
                </>
              )}
            </button>

            <div className="h-2" />
          </div>
        ) : (
          /* Resultados */
          <div>
            {/* Mapa */}
            <div className="relative" style={{ height: 280 }}>
              {geometry.length > 0 ? (
                <MapContainer
                  center={center}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                  attributionControl={false}
                >
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                  <Polyline positions={geometry} color="#2563eb" weight={5} opacity={0.85} />

                  {/* Sensores con coordenadas */}
                  {sensors.filter(s => s.lat != null && s.lon != null).map(s => {
                    const tc = sensorColor(s.carga)
                    const pct = s.carga <= 1.0 ? (s.carga * 100).toFixed(0) : s.carga.toFixed(0)
                    return (
                      <CircleMarker
                        key={s.sensor_id}
                        center={[s.lat, s.lon]}
                        radius={7}
                        pathOptions={{ color: tc.hex, fillColor: tc.hex, fillOpacity: 0.85, weight: 2 }}
                      >
                        <Popup>
                          <div className="text-xs">
                            <b>Sensor #{s.sensor_id}</b><br />
                            Carga: {pct}% — {tc.label}<br />
                            Intensidad: {s.intensidad.toFixed(0)} veh/15min<br />
                            Ocupación: {s.ocupacion.toFixed(1)}%
                          </div>
                        </Popup>
                      </CircleMarker>
                    )
                  })}

                  {geometry.length > 0 && (
                    <Marker position={geometry[0]} icon={originIcon}>
                      <Popup><b>Origen</b><br />{origin}</Popup>
                    </Marker>
                  )}
                  {geometry.length > 1 && (
                    <Marker position={geometry[geometry.length - 1]} icon={destIcon}>
                      <Popup><b>Destino</b><br />{destination}</Popup>
                    </Marker>
                  )}
                </MapContainer>
              ) : (
                <div className="h-full bg-gray-100 flex items-center justify-center">
                  <p className="text-gray-400 text-sm">Sin geometría disponible</p>
                </div>
              )}

              {/* Leyenda sensores */}
              <div className="absolute top-3 right-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow text-[10px] space-y-1">
                {[['#16a34a', '<33%'], ['#d97706', '33–66%'], ['#dc2626', '>66%']].map(([c, l]) => (
                  <div key={l} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                    <span className="text-gray-600">{l} carga</span>
                  </div>
                ))}
              </div>

              {/* Botón nueva búsqueda */}
              <button
                onClick={() => setShowForm(true)}
                className="absolute top-3 left-3 z-[1000] bg-white rounded-full p-2 shadow-md active:scale-95"
              >
                <RotateCcw size={16} className="text-gray-600" />
              </button>

              {/* Botón navegar */}
              <button className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600 text-white px-5 py-2.5 rounded-full font-semibold text-sm flex items-center gap-2 shadow-lg active:scale-95 transition-transform">
                <Navigation size={15} />
                Iniciar Navegación
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">

              {/* Toggle modo vista */}
              <div className="flex bg-gray-100 rounded-xl p-1">
                <button
                  onClick={() => handleToggleMode('osm')}
                  disabled={loading}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 ${mode === 'osm' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                >
                  🛣️ Red Vial (OSM)
                </button>
                <button
                  onClick={() => handleToggleMode('sensors')}
                  disabled={loading}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 ${mode === 'sensors' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                >
                  📡 Sensores
                </button>
              </div>

              {loading && (
                <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span className="text-xs text-blue-600 font-medium">Recalculando ruta en modo {mode === 'osm' ? 'Red Vial' : 'Sensores'}...</span>
                </div>
              )}

              {error && (
                <div className="bg-red-50 rounded-xl px-4 py-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                  <span className="text-xs text-red-600">{error}</span>
                </div>
              )}

              {/* Ruta info */}
              <div className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-xs text-gray-600 truncate">{origin}</span>
                </div>
                <ChevronDown size={14} className="text-gray-400 rotate-[-90deg] flex-shrink-0" />
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                  <span className="text-xs text-gray-600 truncate">{destination}</span>
                </div>
              </div>

              {/* ETA principal */}
              <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Tiempo Total</p>
                <p className="text-5xl font-bold text-gray-900 leading-none">
                  {result.eta_minutes.toFixed(0)}
                  <span className="text-2xl text-gray-400 ml-1">min</span>
                </p>
                <p className="text-xs text-gray-400 mt-1.5">± 2 min según condiciones en tiempo real</p>
              </div>

              {/* Stats */}
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <Gauge size={18} className="text-blue-500 mx-auto mb-1" />
                    <p className="text-[10px] text-gray-400">Velocidad media</p>
                    <p className="text-sm font-bold text-gray-800">
                      {result.avg_speed_kmh != null ? result.avg_speed_kmh.toFixed(1) : '–'} km/h
                    </p>
                  </div>
                  <div className="text-center border-x border-gray-50">
                    <MapPin size={18} className="text-blue-500 mx-auto mb-1" />
                    <p className="text-[10px] text-gray-400">Distancia</p>
                    <p className="text-sm font-bold text-gray-800">
                      {(result.distance_total_m / 1000).toFixed(2)} km
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="text-lg block text-center mb-1">📡</span>
                    <p className="text-[10px] text-gray-400">Sensores</p>
                    <p className="text-sm font-bold text-gray-800">{sensors.length}</p>
                  </div>
                </div>
                {rs && (
                  <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between text-[11px] text-gray-400">
                    <span>Modo: <b className="text-gray-600">{rs.mode.toUpperCase()}</b></span>
                    <span>Skipped: <b className="text-gray-600">{rs.n_sensors_skipped}</b></span>
                    <span>Tiempo: <b className="text-gray-600">{(result.eta_seconds / 60).toFixed(0)} min</b></span>
                  </div>
                )}
              </div>

              {/* Tráfico + Opción */}
              <div className="flex gap-3">
                <div className={`flex-1 rounded-2xl p-3.5 ${traffic.bg}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">🚦 Tráfico</p>
                  <p className={`text-base font-bold ${traffic.text}`}>{traffic.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{sensors.length} sensores predichos</p>
                </div>
                <div className="flex-1 rounded-2xl p-3.5 bg-green-50">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">⚡ Mejor opción</p>
                  <p className="text-base font-bold text-green-700">
                    {result.eta_minutes > 30 ? 'Sal 10 min antes' : 'Sal puntual'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">para optimizar el trayecto</p>
                </div>
              </div>

              {/* Meteorología */}
              {weather && (
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-3">🌤️ Meteorología</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <CloudRain size={15} className="text-blue-400 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] text-gray-400">Precipitación</p>
                        <p className="text-sm font-semibold text-gray-800">{weather.precip_mm.toFixed(1)} mm</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Thermometer size={15} className="text-orange-400 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] text-gray-400">Temperatura</p>
                        <p className="text-sm font-semibold text-gray-800">{weather.temperatura} °C</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm flex-shrink-0">🌧️</span>
                      <div>
                        <p className="text-[10px] text-gray-400">Estado</p>
                        <p className="text-sm font-semibold text-gray-800">{rainLabel(weather.lluvia_ord)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm flex-shrink-0">☔</span>
                      <div>
                        <p className="text-[10px] text-gray-400">Prob. lluvia</p>
                        <p className="text-sm font-semibold text-gray-800">{fmtProb(weather.prob_lluvia)}</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-[9px] text-gray-300 mt-2">Fuente: {weather.fuente}</p>
                </div>
              )}

              {/* Lista sensores */}
              {sensors.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-3">
                    📡 Sensores en Ruta ({sensors.length})
                  </p>
                  <div className="space-y-0 max-h-56 overflow-y-auto scrollbar-hide">
                    {sensors.slice(0, 15).map(s => {
                      const tc = sensorColor(s.carga)
                      const pct = s.carga <= 1.0 ? (s.carga * 100).toFixed(0) : s.carga.toFixed(0)
                      return (
                        <div key={s.sensor_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tc.hex }} />
                            <span className="text-xs text-gray-600 font-medium">#{s.sensor_id}</span>
                            {s.lat != null && (
                              <span className="text-[9px] text-gray-300">{s.lat.toFixed(4)}, {s.lon.toFixed(4)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-400">{s.intensidad.toFixed(0)} veh/15min</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tc.bg} ${tc.text}`}>{pct}%</span>
                          </div>
                        </div>
                      )
                    })}
                    {sensors.length > 15 && (
                      <p className="text-xs text-gray-400 text-center pt-2">+{sensors.length - 15} sensores más</p>
                    )}
                  </div>
                  <div className="flex gap-4 mt-3 pt-3 border-t border-gray-50 text-[11px]">
                    {[['#16a34a', 'Fluido (<33%)'], ['#d97706', 'Moderado (33–66%)'], ['#dc2626', 'Denso (>66%)']].map(([c, l]) => (
                      <div key={l} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
                        <span className="text-gray-400">{l}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="h-4" />
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
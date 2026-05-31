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

const signalIcon = L.divIcon({
  html: '<div style="font-size:14px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">🚦</div>',
  iconSize: [16, 16], iconAnchor: [8, 14], className: '',
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
        useTrafficSignals: settings.useTrafficSignals,
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
        useOsmSpeedLimits: settings.useOsmSpeedLimits,
        useTrafficSignals: settings.useTrafficSignals,
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
  const signalPositions = result?.traffic_signals_positions ?? []
  const signalCount = result?.traffic_signals_count ?? 0
  const signalDelayMin = result?.traffic_signals_delay_min ?? 0

  const avgCarga = sensors.length > 0
    ? sensors.reduce((s, p) => s + p.carga, 0) / sensors.length
    : 0
  const traffic = sensorColor(avgCarga)

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <Header />

      <div className="flex-1 overflow-y-auto scrollbar-hide">

        {/* Formulario de búsqueda */}
        {showForm ? (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Eyebrow + título */}
            <div style={{ padding: '4px 2px 0' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>Planificador de rutas</div>
              <h1 style={{ fontFamily: 'inherit', fontWeight: 600, fontSize: 24, letterSpacing: '-0.025em', lineHeight: 1.3, color: 'var(--ink)', margin: 0 }}>Nueva ruta</h1>
            </div>

            {/* Origen / Destino */}
            <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', padding: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, alignSelf: 'stretch' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 999, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 18, flexShrink: 0 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: '#fff' }} />
                  </span>
                  <span style={{ flex: 1, width: 0, borderLeft: '2px dotted var(--border)', margin: '6px 0' }} />
                  <span style={{ width: 14, height: 14, borderRadius: 999, marginBottom: 18, background: 'var(--surface)', border: '2px solid var(--ink-3)', flexShrink: 0 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Origen</label>
                    <input type="text" value={origin} onChange={e => setOrigin(e.target.value)}
                      style={{ width: '100%', fontSize: 14, fontWeight: 500, color: 'var(--ink)', border: 'none', outline: 'none', background: 'transparent', padding: '4px 0', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ height: 1, background: 'var(--border-soft)', margin: '4px 0' }} />
                  <div>
                    <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Destino</label>
                    <input type="text" value={destination} onChange={e => setDestination(e.target.value)}
                      style={{ width: '100%', fontSize: 14, fontWeight: 500, color: 'var(--ink)', border: 'none', outline: 'none', background: 'transparent', padding: '4px 0', fontFamily: 'inherit' }}
                      placeholder="¿A dónde vas?" />
                  </div>
                </div>
              </div>
            </div>

            {/* Fecha y hora */}
            <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 10px' }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Clock size={12} />
                </span>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Hora de salida</span>
              </div>
              <div style={{ display: 'flex', padding: '0 14px 14px' }}>
                <div style={{ flex: 1, padding: '0 8px 0 0' }}>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.18em', fontWeight: 500, margin: '0 0 6px' }}>FECHA</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={12} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                      style={{ fontSize: 13, color: 'var(--ink)', border: 'none', outline: 'none', width: '100%', fontFamily: 'inherit' }} />
                  </div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ flex: 1, padding: '0 0 0 14px' }}>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.18em', fontWeight: 500, margin: '0 0 6px' }}>HORA</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={12} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
                    <input type="time" value={time} onChange={e => setTime(e.target.value)}
                      style={{ fontSize: 13, color: 'var(--ink)', border: 'none', outline: 'none', width: '100%', fontFamily: 'inherit' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Modo de ruta */}
            <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 10px' }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Layers size={12} />
                </span>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Modo de ruta</span>
              </div>
              <div style={{ position: 'relative', display: 'flex', margin: '0 14px', background: 'var(--bg-2)', borderRadius: 10, padding: 4 }}>
                <div style={{ position: 'absolute', top: 4, left: 4, width: 'calc(50% - 4px)', height: 'calc(100% - 8px)', background: 'var(--surface)', borderRadius: 7, boxShadow: '0 1px 3px rgba(15,20,50,0.08)', transition: 'transform 220ms cubic-bezier(.2,.7,.2,1)', transform: mode === 'osm' ? 'translateX(0)' : 'translateX(100%)' }} />
                <button onClick={() => setMode('osm')} style={{ flex: 1, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, padding: '8px 0', color: mode === 'osm' ? 'var(--primary)' : 'var(--ink-3)', transition: 'color 160ms' }}>
                  🛣️ Red Vial
                </button>
                <button onClick={() => setMode('sensors')} style={{ flex: 1, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, padding: '8px 0', color: mode === 'sensors' ? 'var(--primary)' : 'var(--ink-3)', transition: 'color 160ms' }}>
                  📡 Sensores
                </button>
              </div>
              <p style={{ margin: 0, padding: '10px 14px 14px', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                {mode === 'osm' ? <>Ruta real por la red vial de Madrid. <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: '0.1em', background: 'var(--success-tint)', color: 'var(--success)', padding: '2px 6px', borderRadius: 5, marginLeft: 4, textTransform: 'uppercase', fontWeight: 600 }}>recomendado</span></> : 'Dijkstra sobre el grafo de sensores DGT.'}
              </p>
            </div>

            {/* Simular incidente */}
            <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: '#fef3c7', color: 'var(--warn)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={15} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.005em', margin: 0 }}>Simular incidente</p>
                <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2, marginBottom: 0 }}>Penaliza todos los sensores de la ruta</p>
              </div>
              <button
                onClick={() => setAccidente(v => !v)}
                style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', padding: 0, transition: 'background 200ms', background: accidente ? 'var(--primary)' : '#D1D5DB', flexShrink: 0 }}
              >
                <span style={{ position: 'absolute', top: 2, left: 2, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'transform 200ms cubic-bezier(.2,.7,.2,1)', transform: accidente ? 'translateX(18px)' : 'translateX(0)', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
              </button>
            </div>

            {!settings.weatherData && (
              <div style={{ background: 'var(--primary-tint)', border: '1px solid var(--primary-tint-2)', borderRadius: 14, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CloudRain size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Meteorología desactivada — usando condiciones neutras.</span>
              </div>
            )}

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>
              </div>
            )}

            {/* Botón buscar */}
            <button
              onClick={handleSearch}
              disabled={loading || !destination.trim()}
              style={{
                position: 'relative', overflow: 'hidden',
                width: '100%', height: 52, borderRadius: 14, border: 'none',
                background: 'var(--primary)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 10, cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
                boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                opacity: (loading || !destination.trim()) ? 0.5 : 1,
                letterSpacing: '-0.005em',
              }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Calculando ruta...
                </>
              ) : (
                <>
                  <Search size={16} strokeWidth={2} />
                  Buscar ruta
                </>
              )}
            </button>

            <div style={{ height: 8 }} />
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

                  {/* Semáforos */}
                  {signalPositions.map((pos, i) => (
                    <Marker key={`sig-${i}`} position={pos} icon={signalIcon}>
                      <Popup>
                        <div className="text-xs">
                          <b>🚦 Semáforo #{i + 1}</b><br />
                          Demora estimada: ~{Math.round(signalDelayMin / signalCount * 60 || 0)} s
                        </div>
                      </Popup>
                    </Marker>
                  ))}

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

            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Toggle modo */}
              <div style={{ position: 'relative', display: 'flex', background: 'var(--bg-2)', borderRadius: 10, padding: 4 }}>
                <div style={{ position: 'absolute', top: 4, left: 4, width: 'calc(50% - 4px)', height: 'calc(100% - 8px)', background: 'var(--surface)', borderRadius: 7, boxShadow: '0 1px 3px rgba(15,20,50,0.08)', transition: 'transform 220ms cubic-bezier(.2,.7,.2,1)', transform: mode === 'osm' ? 'translateX(0)' : 'translateX(100%)' }} />
                <button onClick={() => handleToggleMode('osm')} disabled={loading} style={{ flex: 1, position: 'relative', zIndex: 1, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, padding: '8px 0', color: mode === 'osm' ? 'var(--primary)' : 'var(--ink-3)', transition: 'color 160ms', opacity: loading ? 0.6 : 1 }}>
                  🛣️ Red Vial (OSM)
                </button>
                <button onClick={() => handleToggleMode('sensors')} disabled={loading} style={{ flex: 1, position: 'relative', zIndex: 1, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, padding: '8px 0', color: mode === 'sensors' ? 'var(--primary)' : 'var(--ink-3)', transition: 'color 160ms', opacity: loading ? 0.6 : 1 }}>
                  📡 Sensores
                </button>
              </div>

              {loading && (
                <div style={{ background: 'var(--primary-tint)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                  <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500 }}>Recalculando en modo {mode === 'osm' ? 'Red Vial' : 'Sensores'}...</span>
                </div>
              )}

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>
                </div>
              )}

              {/* Ruta info */}
              <div style={{ background: 'var(--surface)', borderRadius: 14, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--success)', flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{origin}</span>
                </div>
                <ChevronDown size={13} style={{ color: 'var(--ink-4)', flexShrink: 0, transform: 'rotate(-90deg)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--danger)', flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{destination}</span>
                </div>
              </div>

              {/* ETA principal */}
              <div style={{ display: 'flex', alignItems: 'stretch', background: '#ffffff', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 8px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 8px' }}>
                  <span style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase', fontWeight: 500 }}>Duración</span>
                  <span style={{ fontSize: 34, fontWeight: 700, marginTop: 4, lineHeight: 1, color: 'var(--primary)', letterSpacing: '-0.02em' }}>
                    {result.eta_minutes.toFixed(0)}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-3)', marginLeft: 3 }}>min</span>
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4 }}>± 2 min</span>
                </div>
                <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 8px' }}>
                  <span style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase', fontWeight: 500 }}>Distancia</span>
                  <span style={{ fontSize: 34, fontWeight: 700, marginTop: 4, lineHeight: 1, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                    {(result.distance_total_m / 1000).toFixed(1)}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-3)', marginLeft: 3 }}>km</span>
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4 }}>recorrido</span>
                </div>
                <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 8px' }}>
                  <span style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase', fontWeight: 500 }}>Vel. media</span>
                  <span style={{ fontSize: 34, fontWeight: 700, marginTop: 4, lineHeight: 1, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                    {result.avg_speed_kmh != null ? result.avg_speed_kmh.toFixed(0) : '–'}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-3)', marginLeft: 3 }}>km/h</span>
                  </span>
                  {signalCount > 0 && <span style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4 }}>{signalCount} semáforos</span>}
                </div>
              </div>

              {signalCount > 0 && (
                <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--ink-3)' }}>🚗 Tiempo de circulación</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--ink)' }}>{(result.eta_minutes - signalDelayMin).toFixed(1)} min</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--ink-3)' }}>🚦 {signalCount} semáforos</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--warn)' }}>+{signalDelayMin.toFixed(1)} min</span>
                  </div>
                </div>
              )}

              {/* Tráfico + Opción */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, borderRadius: 14, padding: '12px 14px', background: traffic.hex === '#16a34a' ? 'var(--success-tint)' : traffic.hex === '#d97706' ? '#fffbeb' : '#fef2f2', border: `1px solid ${traffic.hex === '#16a34a' ? '#bbf7d0' : traffic.hex === '#d97706' ? '#fde68a' : '#fecaca'}` }}>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '0 0 4px' }}>Tráfico</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: traffic.hex, margin: 0 }}>{traffic.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, marginBottom: 0 }}>{sensors.length} sensores</p>
                </div>
                <div style={{ flex: 1, borderRadius: 14, padding: '12px 14px', background: 'var(--success-tint)', border: '1px solid #bbf7d0' }}>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '0 0 4px' }}>Recomendación</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)', margin: 0 }}>{result.eta_minutes > 30 ? 'Sal 10 min antes' : 'Sal puntual'}</p>
                  <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, marginBottom: 0 }}>para optimizar</p>
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

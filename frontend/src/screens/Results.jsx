import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import Header from '../components/Header'
import BottomNav from '../components/BottomNav'
import { ArrowLeft, Navigation, Gauge, MapPin, CloudRain, Thermometer, AlertCircle } from 'lucide-react'

// Fix Leaflet bundler icon issue
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

const originIcon = L.divIcon({
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#16a34a;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: '',
})
const destIcon = L.divIcon({
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#dc2626;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: '',
})

function trafficInfo(carga) {
  const pct = carga <= 1.0 ? carga * 100 : carga
  if (pct < 33) return { bg: 'bg-green-100', text: 'text-green-700', label: 'Fluido', color: '#16a34a' }
  if (pct < 66) return { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Moderado', color: '#d97706' }
  return { bg: 'bg-red-100', text: 'text-red-700', label: 'Denso', color: '#dc2626' }
}

function rainLabel(ord) {
  return ['Sin lluvia', 'Lluvia leve', 'Lluvia moderada', 'Lluvia intensa'][ord] ?? 'Sin lluvia'
}

function fmtProb(v) {
  if (v == null) return '–'
  return v <= 1.0 ? `${(v * 100).toFixed(0)}%` : `${v.toFixed(0)}%`
}

export default function Results() {
  const navigate = useNavigate()
  const { state } = useLocation()

  if (!state?.result) {
    navigate('/')
    return null
  }

  const { result, origin, destination } = state
  const geometry = result.geometry || []
  const center = geometry.length > 0
    ? geometry[Math.floor(geometry.length / 2)]
    : [40.4168, -3.7038]

  const etaMin = result.eta_minutes
  const distKm = (result.distance_total_m / 1000).toFixed(2)
  const vmed = result.avg_speed_kmh != null ? result.avg_speed_kmh.toFixed(1) : '–'
  const weather = result.weather
  const sensors = result.sensor_predictions || []
  const rs = result.route_summary

  const avgCarga = sensors.length > 0
    ? sensors.reduce((s, p) => s + p.carga, 0) / sensors.length
    : 0
  const traffic = trafficInfo(avgCarga)

  return (
    <div className="flex flex-col h-full bg-dots">
      <Header subtitle={`${origin} → ${destination}`} />

      <div className="flex-1 overflow-y-auto scrollbar-hide">

        {/* Mapa */}
        <div className="relative" style={{ height: 260 }}>
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
              <Marker position={geometry[0]} icon={originIcon}>
                <Popup><b>Origen</b><br />{origin}</Popup>
              </Marker>
              <Marker position={geometry[geometry.length - 1]} icon={destIcon}>
                <Popup><b>Destino</b><br />{destination}</Popup>
              </Marker>
            </MapContainer>
          ) : (
            <div className="h-full bg-gray-100 flex items-center justify-center">
              <p className="text-gray-400 text-sm">Sin geometría — modo sensores sin coordenadas</p>
            </div>
          )}

          {/* Botón volver */}
          <button
            onClick={() => navigate('/')}
            className="absolute top-3 left-3 z-[1000] bg-white rounded-full p-2 shadow-md active:scale-95"
          >
            <ArrowLeft size={18} className="text-gray-600" />
          </button>

          {/* Botón navegación */}
          <button className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600 text-white px-6 py-2.5 rounded-full font-semibold text-sm flex items-center gap-2 shadow-lg active:scale-95 transition-transform">
            <Navigation size={15} />
            Iniciar Navegación
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">

          {/* ETA principal */}
          <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Tiempo Total</p>
            <p className="text-5xl font-bold text-gray-900 leading-none">
              {etaMin.toFixed(0)}
              <span className="text-2xl text-gray-400 ml-1">min</span>
            </p>
            <p className="text-xs text-gray-400 mt-2">± 2 min según condiciones en tiempo real</p>
          </div>

          {/* Desglose trayecto */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-3">Desglose del Trayecto</p>
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <span className="text-lg">🚶</span>
                <span className="text-[10px] text-gray-400">5m</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1 mb-1">
                  <div className="h-2 flex-1 bg-amber-400 rounded-l-full" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
                  <div className="h-2 flex-1 bg-amber-400 rounded-r-full" />
                </div>
                <div className="flex justify-between px-1">
                  <span className="text-[10px] text-gray-400">🚗 {etaMin.toFixed(0)} min en coche</span>
                  <span className="text-[10px] text-gray-400">{distKm} km</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-lg">🚶</span>
                <span className="text-[10px] text-gray-400">5m</span>
              </div>
            </div>
            <div className="flex gap-3 mt-3 pt-3 border-t border-gray-50">
              <div className="flex-1 flex items-center gap-2">
                <Gauge size={14} className="text-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400">Velocidad media</p>
                  <p className="text-sm font-semibold text-gray-800">{vmed} km/h</p>
                </div>
              </div>
              <div className="w-px bg-gray-100" />
              <div className="flex-1 flex items-center gap-2">
                <MapPin size={14} className="text-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400">Distancia</p>
                  <p className="text-sm font-semibold text-gray-800">{distKm} km</p>
                </div>
              </div>
              {rs && (
                <>
                  <div className="w-px bg-gray-100" />
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm flex-shrink-0">📡</span>
                    <div>
                      <p className="text-[10px] text-gray-400">Sensores</p>
                      <p className="text-sm font-semibold text-gray-800">{rs.n_sensors_predicted}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Tráfico + Mejor opción */}
          <div className="flex gap-3">
            <div className={`flex-1 rounded-2xl p-3.5 ${traffic.bg}`}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">🚦 Tráfico</p>
              <p className={`text-base font-bold ${traffic.text}`}>{traffic.label}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {sensors.length} sensores · modo {rs?.mode ?? '–'}
              </p>
            </div>
            <div className="flex-1 rounded-2xl p-3.5 bg-green-50">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">⚡ Mejor opción</p>
              <p className="text-base font-bold text-green-700">
                {etaMin > 30 ? 'Sal 10 min antes' : 'Sal puntual'}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">para optimizar el trayecto</p>
            </div>
          </div>

          {/* Meteorología */}
          {weather && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-3">🌤️ Condiciones Meteorológicas</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <CloudRain size={16} className="text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-400">Precipitación</p>
                    <p className="text-sm font-semibold text-gray-800">{weather.precip_mm.toFixed(1)} mm</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Thermometer size={16} className="text-orange-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-400">Temperatura</p>
                    <p className="text-sm font-semibold text-gray-800">{weather.temperatura} °C</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base flex-shrink-0">🌧️</span>
                  <div>
                    <p className="text-[10px] text-gray-400">Estado</p>
                    <p className="text-sm font-semibold text-gray-800">{rainLabel(weather.lluvia_ord)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-blue-300 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-400">Prob. lluvia</p>
                    <p className="text-sm font-semibold text-gray-800">{fmtProb(weather.prob_lluvia)}</p>
                  </div>
                </div>
              </div>
              <p className="text-[9px] text-gray-300 mt-2">Fuente: {weather.fuente}</p>
            </div>
          )}

          {/* Sensores */}
          {sensors.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-3">
                📡 Sensores en Ruta ({sensors.length})
              </p>
              <div className="space-y-0 max-h-52 overflow-y-auto scrollbar-hide">
                {sensors.slice(0, 12).map((s) => {
                  const tc = trafficInfo(s.carga)
                  const pct = s.carga <= 1.0 ? (s.carga * 100).toFixed(0) : s.carga.toFixed(0)
                  return (
                    <div key={s.sensor_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tc.color }} />
                        <span className="text-xs text-gray-600 font-medium">Sensor #{s.sensor_id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400">{s.intensidad.toFixed(0)} veh/15min</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tc.bg} ${tc.text}`}>
                          {pct}%
                        </span>
                      </div>
                    </div>
                  )
                })}
                {sensors.length > 12 && (
                  <p className="text-[11px] text-gray-400 text-center pt-2">+{sensors.length - 12} sensores más</p>
                )}
              </div>
            </div>
          )}

          <div className="h-4" />
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
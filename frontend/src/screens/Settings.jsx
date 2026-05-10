import Header from '../components/Header'
import BottomNav from '../components/BottomNav'
import { useSettings } from '../context/SettingsContext'
import { Lock, RefreshCw, ChevronRight, LogOut, Info, Home } from 'lucide-react'

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-blue-600' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function SettingRow({ label, desc, value, onChange, badge = null }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="flex-1 pr-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-800">{label}</p>
          {badge && (
            <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">
              {badge}
            </span>
          )}
        </div>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}

function SliderRow({ label, value, onChange, min, max, step = 0.1, unit }) {
  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-700">{label}</span>
        <span className="text-sm font-semibold text-blue-600">{value} {unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  )
}

export default function Settings() {
  const { settings, updateSetting } = useSettings()

  return (
    <div className="flex flex-col h-full bg-dots">
      <Header />

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide pb-4">

        {/* Banner info */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
          <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-600 leading-relaxed">
            Los ajustes marcados con <b>API</b> afectan directamente a las llamadas al modelo de predicción.
          </p>
        </div>

        {/* Mi Casa */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Home size={15} className="text-blue-600" />
            <p className="font-semibold text-gray-800 text-sm">Mi Casa</p>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
              Dirección de casa
            </label>
            <input
              type="text"
              value={settings.homeAddress}
              onChange={e => updateSetting('homeAddress', e.target.value)}
              placeholder="Ej: Calle Gran Vía, 10, Madrid"
              className="w-full text-sm text-gray-700 border border-gray-100 rounded-xl px-3 py-2.5 mt-1.5 focus:outline-none focus:border-blue-300 transition-colors"
            />
            <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
              Punto de partida para calcular tiempos desde casa en el planificador.
            </p>
          </div>
        </div>

        {/* Modelo de predicción */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🤖</span>
            <p className="font-semibold text-gray-800 text-sm">Modelo de Predicción</p>
          </div>
          <SettingRow
            label="Datos meteorológicos"
            desc="Incluir clima en tiempo real desde Open-Meteo"
            value={settings.weatherData}
            onChange={v => updateSetting('weatherData', v)}
            badge="API"
          />
          <SettingRow
            label="Datos históricos"
            desc="Analizar patrones de semanas previas"
            value={settings.historicalData}
            onChange={v => updateSetting('historicalData', v)}
          />
          <SettingRow
            label="Eventos locales"
            desc="Detectar conciertos y partidos"
            value={settings.localEvents}
            onChange={v => updateSetting('localEvents', v)}
          />
          {/* [OSM-SPEED] toggle — para eliminar: quitar este bloque */}
          <SettingRow
            label="Velocidades máximas reales (OSM)"
            desc="Usa los límites de velocidad del mapa en lugar de 50/100 km/h fijos"
            value={settings.useOsmSpeedLimits}
            onChange={v => updateSetting('useOsmSpeedLimits', v)}
            badge="API"
          />
        </div>

        {/* Estado actual del modelo */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-3">Estado actual de la API</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Meteorología</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${settings.weatherData ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {settings.weatherData ? '✓ Open-Meteo activo' : '✗ Condiciones neutras'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Modo por defecto</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                OSM (red vial)
              </span>
            </div>
            {/* [OSM-SPEED] estado del toggle — para eliminar: quitar este bloque */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Velocidad libre</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${settings.useOsmSpeedLimits ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {settings.useOsmSpeedLimits ? '✓ OSM maxspeed' : '✗ 50/100 km/h fijos'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Backend</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                localhost:8000
              </span>
            </div>
          </div>
        </div>

        {/* Preferencias de viaje */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🏃</span>
            <p className="font-semibold text-gray-800 text-sm">Preferencias de Viaje</p>
          </div>
          <SliderRow
            label="Velocidad de caminata preferida"
            value={settings.walkSpeed}
            onChange={v => updateSetting('walkSpeed', v)}
            min={2}
            max={8}
            unit="km/h"
          />
          <SliderRow
            label="Límite de velocidad máxima"
            value={settings.maxSpeed}
            onChange={v => updateSetting('maxSpeed', Math.round(v))}
            min={50}
            max={130}
            step={1}
            unit="km/h"
          />
        </div>

        {/* Notificaciones */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🔔</span>
            <p className="font-semibold text-gray-800 text-sm">Notificaciones Inteligentes</p>
          </div>
          <SettingRow
            label="Alertas proactivas"
            desc="Notificar cambios bruscos de tráfico"
            value={settings.proactiveAlerts}
            onChange={v => updateSetting('proactiveAlerts', v)}
          />
        </div>

        {/* Cuenta */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">👤</span>
            <p className="font-semibold text-gray-800 text-sm">Cuenta</p>
          </div>
          {[
            { Icon: Lock, label: 'Privacidad y Seguridad' },
            { Icon: RefreshCw, label: 'Sincronización de Datos' },
          ].map(({ Icon, label }) => (
            <div
              key={label}
              className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <Icon size={15} className="text-gray-500" />
                <span className="text-sm text-gray-700">{label}</span>
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-3 cursor-pointer hover:bg-red-50 -mx-1 px-1 rounded-lg py-2 transition-colors">
            <LogOut size={15} className="text-red-500" />
            <span className="text-sm text-red-500 font-medium">Cerrar Sesión</span>
          </div>
        </div>

        <div className="h-4" />
      </div>

      <BottomNav />
    </div>
  )
}
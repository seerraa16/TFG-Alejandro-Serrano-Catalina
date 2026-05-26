import Header from '../components/Header'
import BottomNav from '../components/BottomNav'
import { useSettings } from '../context/SettingsContext'
import {
  Lock, RefreshCw, ChevronRight, LogOut, Info,
  Home, Cloud, BarChart2, Music2, Gauge, Timer,
} from 'lucide-react'

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

function SettingRow({ icon: Icon, label, desc, value, onChange, badge = null }) {
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-gray-50 last:border-0">
      {Icon && (
        <div className="w-8 h-8 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <Icon size={15} className="text-gray-400" />
        </div>
      )}
      <div className="flex-1 min-w-0 pr-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-800">{label}</p>
          {badge && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${badge === 'API' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
              {badge}
            </span>
          )}
        </div>
        {desc && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}

function SliderRow({ label, value, onChange, min, max, step = 0.1, unit }) {
  return (
    <div className="py-3.5 border-b border-gray-50 last:border-0">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-medium text-gray-800">{label}</span>
        <span className="text-sm font-bold text-blue-600">{value} {unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-blue-600"
      />
    </div>
  )
}

export default function Settings() {
  const { settings, updateSetting } = useSettings()

  return (
    <div className="flex flex-col h-full" style={{ background: '#f8fafc' }}>
      <Header />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-hide">

        {/* Banner API */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-start gap-2.5">
          <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-600 leading-relaxed">
            Los ajustes con{' '}
            <span className="text-[9px] bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded font-bold">API</span>
            {' '}afectan directamente al modelo de predicción.
          </p>
        </div>

        {/* Mi Casa */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
              <Home size={15} className="text-blue-600" />
            </div>
            <p className="font-semibold text-gray-900 text-sm">Mi Casa</p>
          </div>
          <p className="text-[10px] text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">Dirección</p>
          <input
            type="text"
            value={settings.homeAddress}
            onChange={e => updateSetting('homeAddress', e.target.value)}
            placeholder="Ej: Calle Gran Vía, 10, Madrid"
            className="w-full text-sm text-gray-700 border border-gray-100 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition-all placeholder-gray-300"
          />
          <p className="text-xs text-gray-400 mt-2 leading-relaxed">
            Punto de partida para calcular tiempos desde casa.
          </p>
        </div>

        {/* Modelo de predicción */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="font-semibold text-gray-900 text-sm mb-1">Modelo de predicción</p>
          <SettingRow
            icon={Cloud}
            label="Datos meteorológicos"
            desc="Clima en tiempo real desde Open-Meteo"
            value={settings.weatherData}
            onChange={v => updateSetting('weatherData', v)}
            badge="API"
          />
          <SettingRow
            icon={BarChart2}
            label="Datos históricos"
            desc="Patrones de semanas previas"
            value={settings.historicalData}
            onChange={v => updateSetting('historicalData', v)}
          />
          <SettingRow
            icon={Music2}
            label="Eventos locales"
            desc="Conciertos y partidos en la ciudad"
            value={settings.localEvents}
            onChange={v => updateSetting('localEvents', v)}
          />
          <SettingRow
            icon={Gauge}
            label="Velocidades máximas reales"
            desc="Límites del mapa en lugar de 50/100 km/h fijos"
            value={settings.useOsmSpeedLimits}
            onChange={v => updateSetting('useOsmSpeedLimits', v)}
            badge="API"
          />
          <SettingRow
            icon={Timer}
            label="Demora por semáforos"
            desc="Añade espera estimada en semáforos (15–35 s c/u según hora)"
            value={settings.useTrafficSignals}
            onChange={v => updateSetting('useTrafficSignals', v)}
            badge="API"
          />
        </div>

        {/* Estado de la API */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-3">Estado actual</p>
          <div className="space-y-2.5">
            {[
              {
                label: 'Meteorología',
                value: settings.weatherData ? '✓ Open-Meteo' : '✗ Neutro',
                ok: settings.weatherData,
              },
              { label: 'Modo por defecto', value: 'OSM (red vial)', ok: true },
              {
                label: 'Velocidad libre',
                value: settings.useOsmSpeedLimits ? '✓ OSM maxspeed' : '✗ 50/100 km/h',
                ok: settings.useOsmSpeedLimits,
              },
              {
                label: 'Semáforos',
                value: settings.useTrafficSignals ? '✓ Activados' : '✗ Desactivados',
                ok: settings.useTrafficSignals,
              },
              { label: 'Backend', value: 'localhost:8000', ok: true },
            ].map(({ label, value, ok }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{label}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Preferencias de viaje */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="font-semibold text-gray-900 text-sm mb-1">Preferencias de viaje</p>
          <SliderRow
            label="Velocidad caminando"
            value={settings.walkSpeed}
            onChange={v => updateSetting('walkSpeed', v)}
            min={2} max={8} unit="km/h"
          />
          <SliderRow
            label="Velocidad máxima"
            value={settings.maxSpeed}
            onChange={v => updateSetting('maxSpeed', Math.round(v))}
            min={50} max={130} step={1} unit="km/h"
          />
        </div>

        {/* Notificaciones */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="font-semibold text-gray-900 text-sm mb-1">Notificaciones</p>
          <SettingRow
            label="Alertas proactivas"
            desc="Avisos de cambios bruscos en el tráfico"
            value={settings.proactiveAlerts}
            onChange={v => updateSetting('proactiveAlerts', v)}
          />
        </div>

        {/* Cuenta */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="font-semibold text-gray-900 text-sm mb-1">Cuenta</p>
          {[
            { Icon: Lock, label: 'Privacidad y seguridad' },
            { Icon: RefreshCw, label: 'Sincronización de datos' },
          ].map(({ Icon, label }) => (
            <div
              key={label}
              className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0 cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Icon size={14} className="text-gray-400" />
                <span className="text-sm text-gray-700">{label}</span>
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </div>
          ))}
          <div className="flex items-center gap-2.5 pt-3 cursor-pointer">
            <LogOut size={14} className="text-red-400" />
            <span className="text-sm text-red-400 font-medium">Cerrar sesión</span>
          </div>
        </div>

        <div className="h-4" />
      </div>

      <BottomNav />
    </div>
  )
}

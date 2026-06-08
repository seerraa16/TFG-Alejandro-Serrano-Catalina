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
      type="button"
      onClick={() => onChange(!value)}
      style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', padding: 0, flexShrink: 0,
        transition: 'background 200ms',
        background: value ? 'var(--primary)' : '#D1D5DB',
        boxShadow: 'none' }}
    >
      <span style={{ position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 999, background: '#fff',
        transition: 'transform 200ms cubic-bezier(.2,.7,.2,1)',
        transform: value ? 'translateX(18px)' : 'translateX(0)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  )
}

function SettingRow({ icon: Icon, label, desc, value, onChange, badge = null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderBottom: '1px solid var(--border-soft)' }} className="last:border-0">
      {Icon && (
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--bg-2)', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={14} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.005em', lineHeight: 1.3, margin: 0 }}>{label}</p>
          {badge && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: '0.1em', color: badge === 'API' ? 'var(--primary)' : '#92400e', background: badge === 'API' ? 'var(--primary-tint)' : '#fef3c7', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
              {badge}
            </span>
          )}
        </div>
        {desc && <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.35, marginBottom: 0 }}>{desc}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}

function SliderRow({ label, value, onChange, min, max, step = 0.1, unit }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border-soft)' }} className="last:border-0">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{label}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>{value} <span style={{ opacity: 0.6 }}>{unit}</span></span>
      </div>
      <div style={{ position: 'relative', height: 6, background: '#e4e4e7', borderRadius: 999 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${pct}%`, background: 'var(--primary)', borderRadius: 999 }} />
        <div style={{ position: 'absolute', top: -6, left: `calc(${pct}% - 9px)`, width: 18, height: 18, borderRadius: 999, background: '#fff', border: '2px solid var(--primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.15)', pointerEvents: 'none' }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
          style={{ position: 'absolute', top: -6, left: 0, right: 0, width: '100%', height: 18, appearance: 'none', WebkitAppearance: 'none', background: 'transparent', opacity: 0, cursor: 'pointer' }} />
      </div>
    </div>
  )
}

export default function Settings() {
  const { settings, updateSetting } = useSettings()

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <Header />

      <div className="flex-1 overflow-y-auto scrollbar-hide">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 16px' }}>

        {/* Eyebrow + título */}
        <div style={{ padding: '4px 2px 0' }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>Ajustes</div>
          <h1 style={{ fontFamily: 'inherit', fontWeight: 600, fontSize: 24, letterSpacing: '-0.025em', lineHeight: 1.3, color: 'var(--ink)', margin: 0 }}>Tu configuración</h1>
        </div>

        {/* Banner API */}
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: 'var(--primary-tint)', color: 'var(--ink-2)', padding: '11px 12px', borderRadius: 12, fontSize: 12.5, lineHeight: 1.4, border: '1px solid var(--primary-tint-2)' }}>
          <Info size={14} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0 }}>
            Los ajustes con{' '}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.1em', color: 'var(--primary)', background: '#fff', padding: '1px 5px', borderRadius: 4, fontWeight: 600, border: '1px solid var(--primary-tint-2)' }}>API</span>
            {' '}afectan directamente al modelo de predicción.
          </p>
        </div>

        {/* Mi Casa */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 14px 8px' }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Home size={12} />
            </span>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', letterSpacing: '-0.01em', margin: 0 }}>Mi Casa</p>
          </div>
          <div style={{ padding: '4px 14px 14px' }}>
            <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.06em', fontWeight: 500, textTransform: 'uppercase', marginBottom: 6 }}>Dirección de casa</p>
            <input
              type="text"
              value={settings.homeAddress}
              onChange={e => updateSetting('homeAddress', e.target.value)}
              placeholder="Ej: Calle Gran Vía, 10, Madrid"
              style={{ width: '100%', fontSize: 13.5, color: 'var(--ink)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '10px 12px', outline: 'none', background: 'var(--bg-2)', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 8, marginBottom: 0, lineHeight: 1.4 }}>
              Punto de partida para calcular tiempos desde casa.
            </p>
          </div>
        </div>

        {/* Modelo de predicción */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 14px 8px' }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart2 size={12} />
            </span>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', letterSpacing: '-0.01em', margin: 0 }}>Modelo de predicción</p>
          </div>
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
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 14px 8px' }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--success-tint)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={12} />
            </span>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', letterSpacing: '-0.01em', margin: 0 }}>Estado actual de la API</p>
          </div>
          <div style={{ padding: '4px 14px 12px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { label: 'Meteorología', value: settings.weatherData ? 'Open-Meteo activo' : 'Neutro', ok: settings.weatherData },
              { label: 'Modo por defecto', value: 'OSM (red vial)', ok: true },
              { label: 'Velocidad libre', value: settings.useOsmSpeedLimits ? 'OSM maxspeed' : '50/100 km/h', ok: settings.useOsmSpeedLimits },
              { label: 'Semáforos', value: settings.useTrafficSignals ? 'Activados' : 'Desactivados', ok: settings.useTrafficSignals },
              { label: 'Backend', value: 'localhost:8000', ok: true },
            ].map(({ label, value, ok }, i, arr) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{label}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, background: ok ? 'var(--success-tint)' : 'var(--bg-2)', color: ok ? 'var(--success)' : 'var(--ink-3)', padding: '3px 9px', borderRadius: 999 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 999, background: ok ? 'var(--success)' : 'var(--ink-4)' }} />
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Preferencias de viaje */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 14px 8px' }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Gauge size={12} />
            </span>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', letterSpacing: '-0.01em', margin: 0 }}>Preferencias de viaje</p>
          </div>
          <div style={{ padding: '0 14px 6px' }}>
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
        </div>

        {/* Notificaciones */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 14px 8px' }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={12} />
            </span>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', letterSpacing: '-0.01em', margin: 0 }}>Notificaciones</p>
          </div>
          <SettingRow
            label="Alertas proactivas"
            desc="Avisos de cambios bruscos en el tráfico"
            value={settings.proactiveAlerts}
            onChange={v => updateSetting('proactiveAlerts', v)}
          />
        </div>

        {/* Cuenta */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 14px 8px' }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={12} />
            </span>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', letterSpacing: '-0.01em', margin: 0 }}>Cuenta</p>
          </div>
          {[
            { Icon: Lock, label: 'Privacidad y seguridad' },
            { Icon: RefreshCw, label: 'Sincronización de datos' },
          ].map(({ Icon, label }) => (
            <div
              key={label}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon size={14} style={{ color: 'var(--ink-2)' }} />
                <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{label}</span>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--ink-4)' }} />
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }}>
            <LogOut size={14} style={{ color: 'var(--danger)' }} />
            <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--danger)' }}>Cerrar sesión</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', color: 'var(--ink-4)', fontSize: 11 }}>
          <span>¡A tiempo! · Madrid</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>v2.3.0</span>
        </div>

        <div style={{ height: 8 }} />
      </div>
      </div>

      <BottomNav />
    </div>
  )
}

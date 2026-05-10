import { createContext, useContext, useState } from 'react'

const SettingsContext = createContext()

const DEFAULTS = {
  weatherData: true,
  historicalData: true,
  localEvents: false,
  proactiveAlerts: true,
  walkSpeed: 5.2,
  maxSpeed: 120,
  useOsmSpeedLimits: false, // [OSM-SPEED]
}

function load() {
  try {
    const s = localStorage.getItem('pt_settings')
    return s ? { ...DEFAULTS, ...JSON.parse(s) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load)

  const updateSetting = (key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem('pt_settings', JSON.stringify(next))
      return next
    })
  }

  // Build weather_override for the API when weatherData is disabled
  const weatherOverride = settings.weatherData
    ? null
    : { precip_mm: 0, lluvia_ord: 0, llueve: 0, temperatura: 20, prob_lluvia: 0, fuente: 'override' }

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, weatherOverride }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)
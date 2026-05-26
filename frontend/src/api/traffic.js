const BASE_URL = 'http://localhost:8001'

export async function chatAgent({ message, homeAddress = 'Madrid', history = [] }) {
  const res = await fetch(`${BASE_URL}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      home_address: homeAddress,
      history: history.map(m => ({ role: m.role, content: m.content })),
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `Error ${res.status}` }))
    throw new Error(err.detail || `Error ${res.status}`)
  }
  return res.json()
}

export async function predictETA({
  origin,
  destination,
  datetime,
  mode = 'osm',
  accidente = false,
  weatherOverride = null,
  useOsmSpeedLimits = false, // [OSM-SPEED]
  useTrafficSignals = true,
}) {
  const body = { origin, destination, datetime, mode, accidente }
  if (weatherOverride !== null) body.weather_override = weatherOverride
  if (useOsmSpeedLimits) body.use_osm_speed_limits = true // [OSM-SPEED]
  body.use_traffic_signals = useTrafficSignals

  const res = await fetch(`${BASE_URL}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `Error ${res.status}` }))
    throw new Error(err.detail || `Error ${res.status}`)
  }
  return res.json()
}

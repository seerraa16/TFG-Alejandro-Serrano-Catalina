const BASE_URL = 'http://localhost:8000'

export async function predictETA({
  origin,
  destination,
  datetime,
  mode = 'osm',
  accidente = false,
  weatherOverride = null,
  useOsmSpeedLimits = false, // [OSM-SPEED]
}) {
  const body = { origin, destination, datetime, mode, accidente }
  if (weatherOverride !== null) body.weather_override = weatherOverride
  if (useOsmSpeedLimits) body.use_osm_speed_limits = true // [OSM-SPEED]

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
import { createContext, useContext, useState, useMemo, useCallback } from 'react'
import { useGoogleLogin } from '@react-oauth/google'

const EventsContext = createContext()

const DAY_LABELS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']

function getDayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return DAY_LABELS[d.getDay()]
}

function getDayNum(dateStr) {
  return new Date(dateStr + 'T12:00:00').getDate().toString()
}

const SEED_EVENTS = [
  {
    id: 'ev1',
    title: 'Reunión de Equipo',
    date: '2026-05-14',
    eventTime: '10:00',
    departureTime: '09:30',
    location: 'Calle de Francisco Gervás, 145',
    destination: 'Calle de Francisco Gervás, 145, Madrid',
    status: 'CONFIRMADO',
  },
  {
    id: 'ev2',
    title: 'Ir Farmacia',
    date: '2026-05-15',
    eventTime: '19:00',
    departureTime: '18:30',
    location: 'Calle de Purchena, 23, Hortaleza',
    destination: 'Calle de Purchena, 23, Hortaleza, Madrid',
    status: null,
  },
]

function load() {
  try {
    const s = localStorage.getItem('pt_events')
    if (s) return JSON.parse(s)
    localStorage.setItem('pt_events', JSON.stringify(SEED_EVENTS))
    return SEED_EVENTS
  } catch {
    return SEED_EVENTS
  }
}

function save(events) {
  localStorage.setItem('pt_events', JSON.stringify(events))
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const da = new Date(`${a.date}T${a.eventTime}`)
    const db = new Date(`${b.date}T${b.eventTime}`)
    return da - db
  })
}

const STREET_PREFIXES = /^(calle|c[/.\\]|av[./]|avda\.|avenida|paseo|pso\.|plaza|pl\.|cam\.|camino|ronda|carretera|ctra\.|bulevar|\d)/i

function extractStreetAddress(location) {
  if (!location) return ''
  const parts = location.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length <= 1) return location
  // Busca el primer fragmento que parece dirección (puede haber varios nombres de empresa antes)
  const streetIdx = parts.findIndex(p => STREET_PREFIXES.test(p))
  // Si la calle es el primer fragmento o no se encontró ninguna, usar la dirección completa
  if (streetIdx <= 0) return location
  return parts.slice(streetIdx).join(', ').trim()
}

async function fetchGoogleCalendarEvents(accessToken) {
  const now = new Date().toISOString()
  const next14d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(now)}` +
    `&timeMax=${encodeURIComponent(next14d)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=50`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Error al obtener eventos de Google Calendar')

  const data = await res.json()
  return (data.items || [])
    .filter(e => e.start?.dateTime)
    .map(e => {
      const rawLocation = e.location || ''
      const cleanAddress = extractStreetAddress(rawLocation)
      const destination =
        cleanAddress && !cleanAddress.toLowerCase().includes('madrid')
          ? cleanAddress + ', Madrid'
          : cleanAddress
      return {
        id: `gc_${e.id}`,
        title: e.summary || 'Sin título',
        date: e.start.dateTime.slice(0, 10),
        eventTime: e.start.dateTime.slice(11, 16),
        departureTime: e.start.dateTime.slice(11, 16),
        location: rawLocation || 'Sin ubicación',
        destination,
        status: 'GOOGLE',
        hasLocation: !!rawLocation,
      }
    })
}

export function EventsProvider({ children }) {
  const [events, setEvents] = useState(load)
  const [googleEvents, setGoogleEvents] = useState([])
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState(null)

  const handleGoogleSuccess = useCallback(async (tokenResponse) => {
    setGoogleLoading(true)
    setGoogleError(null)
    try {
      const fetched = await fetchGoogleCalendarEvents(tokenResponse.access_token)
      setGoogleEvents(fetched)
      setIsGoogleConnected(true)
    } catch (err) {
      console.error('Error al importar Google Calendar:', err)
      setGoogleError('No se pudieron cargar los eventos. Inténtalo de nuevo.')
    } finally {
      setGoogleLoading(false)
    }
  }, [])

  const connectGoogle = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    onSuccess: handleGoogleSuccess,
    onError: () => setGoogleError('Error al conectar con Google. Inténtalo de nuevo.'),
  })

  const addEvent = (event) => {
    setEvents(prev => {
      const next = sortEvents([...prev, { ...event, id: Date.now().toString() }])
      save(next)
      return next
    })
  }

  const removeEvent = (id) => {
    if (id.startsWith('gc_')) return
    setEvents(prev => {
      const next = prev.filter(e => e.id !== id)
      save(next)
      return next
    })
  }

  const allEvents = useMemo(
    () => sortEvents([...events, ...googleEvents]),
    [events, googleEvents]
  )

  const enriched = useMemo(
    () => allEvents.map(e => ({ ...e, dayLabel: getDayLabel(e.date), dayNum: getDayNum(e.date) })),
    [allEvents]
  )

  return (
    <EventsContext.Provider value={{
      events: enriched,
      addEvent,
      removeEvent,
      connectGoogle,
      isGoogleConnected,
      googleLoading,
      googleError,
    }}>
      {children}
    </EventsContext.Provider>
  )
}

export const useEvents = () => useContext(EventsContext)

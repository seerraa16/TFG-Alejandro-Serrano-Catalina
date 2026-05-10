import { createContext, useContext, useState, useMemo } from 'react'

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

export function EventsProvider({ children }) {
  const [events, setEvents] = useState(load)

  const addEvent = (event) => {
    setEvents(prev => {
      const next = sortEvents([...prev, { ...event, id: Date.now().toString() }])
      save(next)
      return next
    })
  }

  const removeEvent = (id) => {
    setEvents(prev => {
      const next = prev.filter(e => e.id !== id)
      save(next)
      return next
    })
  }

  const enriched = useMemo(() => events.map(e => ({
    ...e,
    dayLabel: getDayLabel(e.date),
    dayNum: getDayNum(e.date),
  })), [events])

  return (
    <EventsContext.Provider value={{ events: enriched, addEvent, removeEvent }}>
      {children}
    </EventsContext.Provider>
  )
}

export const useEvents = () => useContext(EventsContext)

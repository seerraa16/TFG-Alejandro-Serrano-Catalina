import { useLocation } from 'react-router-dom'
import { CalendarDays, Bot, Route, Settings, CircleUser } from 'lucide-react'

const SCREEN_ICONS = {
  '/':         CalendarDays,
  '/history':  Bot,
  '/route':    Route,
  '/results':  Route,
  '/settings': Settings,
}

export default function Header({ subtitle = null, rightAction = null }) {
  const { pathname } = useLocation()
  const Icon = SCREEN_ICONS[pathname] ?? CalendarDays

  return (
    <header style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '8px 16px 10px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} color="#fff" strokeWidth={2} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          ¡A tiempo!
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--success)', flexShrink: 0 }} />
          {subtitle ?? 'Madrid'}
        </div>
      </div>

      {rightAction ?? <CircleUser size={32} color="var(--ink-3)" strokeWidth={1.5} style={{ flexShrink: 0 }} />}
    </header>
  )
}

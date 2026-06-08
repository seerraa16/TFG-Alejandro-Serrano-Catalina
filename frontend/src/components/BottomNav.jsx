import { useNavigate, useLocation } from 'react-router-dom'
import { CalendarDays, Bot, Route, Settings } from 'lucide-react'

const TABS = [
  { id: 'planner',  path: '/',         icon: CalendarDays, label: 'Calendario' },
  { id: 'history',  path: '/history',  icon: Bot,          label: 'Agente' },
  { id: 'route',    path: '/route',    icon: Route,        label: 'Ruta' },
  { id: 'settings', path: '/settings', icon: Settings,     label: 'Ajustes' },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isActive = (tab) => {
    if (tab.id === 'planner') return pathname === '/'
    return pathname === tab.path
  }

  return (
    <nav style={{
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = isActive(tab)
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '10px 0 14px',
                fontFamily: 'inherit',
                color: active ? 'var(--primary)' : 'var(--ink-3)',
                transition: 'color 120ms',
              }}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span style={{
                fontSize: 10,
                fontWeight: active ? 600 : 400,
              }}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

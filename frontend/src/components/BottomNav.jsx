import { useNavigate, useLocation } from 'react-router-dom'
import { CalendarDays, Bot, Route, Settings } from 'lucide-react'

const TABS = [
  { id: 'planner', path: '/', icon: CalendarDays, label: 'Calendario' },
  { id: 'history', path: '/history', icon: Bot, label: 'Agente' },
  { id: 'route', path: '/route', icon: Route, label: 'Ruta' },
  { id: 'settings', path: '/settings', icon: Settings, label: 'Ajustes' },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isActive = (tab) => {
    if (tab.id === 'planner') return pathname === '/'
    return pathname === tab.path
  }

  return (
    <nav className="bg-white border-t border-gray-100 flex-shrink-0 pb-safe">
      <div className="flex">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = isActive(tab)
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className="flex-1 pt-2 pb-2.5 flex flex-col items-center gap-1 transition-colors relative"
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-blue-600 rounded-full" />
              )}
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 1.8}
                className={active ? 'text-blue-600' : 'text-gray-400'}
              />
              <span className={`text-[10px] font-medium ${active ? 'text-blue-600' : 'text-gray-400'}`}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

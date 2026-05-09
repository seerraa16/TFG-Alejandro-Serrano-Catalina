import { useNavigate, useLocation } from 'react-router-dom'
import { MapPin, History, Route, Settings } from 'lucide-react'

const TABS = [
  { id: 'planner', path: '/', icon: MapPin, label: 'PLANNER' },
  { id: 'history', path: '/history', icon: History, label: 'HISTORY' },
  { id: 'route', path: '/route', icon: Route, label: 'RUTA' },
  { id: 'settings', path: '/settings', icon: Settings, label: 'SETTINGS' },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isActive = (tab) => {
    if (tab.id === 'planner') return pathname === '/'
    return pathname === tab.path
  }

  return (
    <nav className="bg-white border-t border-gray-100 flex-shrink-0">
      <div className="flex">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = isActive(tab)
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors ${active ? 'text-blue-600' : 'text-gray-400'}`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
              <span className={`text-[9px] font-semibold tracking-wider ${active ? 'text-blue-600' : 'text-gray-400'}`}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SettingsProvider } from './context/SettingsContext'
import { EventsProvider } from './context/EventsContext'
import Planner from './screens/Planner'
import RouteScreen from './screens/Route'
import History from './screens/History'
import Settings from './screens/Settings'

export default function App() {
  return (
    <SettingsProvider>
      <EventsProvider>
      <BrowserRouter>
        <div
          className="h-screen flex flex-col overflow-hidden"
          style={{ maxWidth: 430, margin: '0 auto', background: 'var(--bg)' }}
        >
          <Routes>
            <Route path="/" element={<Planner />} />
            <Route path="/route" element={<RouteScreen />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </BrowserRouter>
      </EventsProvider>
    </SettingsProvider>
  )
}
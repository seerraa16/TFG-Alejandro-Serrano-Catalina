import { Navigation } from 'lucide-react'

export default function Header({ subtitle = null }) {
  return (
    <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2 flex-shrink-0">
      <Navigation size={18} className="text-blue-600" />
      <div className="flex-1">
        <span className="font-bold text-blue-600 text-[15px] tracking-tight">Predictive Traffic</span>
        {subtitle && <p className="text-xs text-gray-400 leading-none mt-0.5">{subtitle}</p>}
      </div>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        AS
      </div>
    </header>
  )
}
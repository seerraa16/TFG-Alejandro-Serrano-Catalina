import { Navigation, Search } from 'lucide-react'

export default function Header({ subtitle = null }) {
  return (
    <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 flex-shrink-0">
      <div className="w-9 h-9 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-200">
        <Navigation size={17} className="text-white" strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-0.5 leading-none">
          <span className="font-bold text-gray-900 text-[15px] tracking-tight">Predictive</span>
          <span className="font-bold italic text-blue-600 text-[15px] tracking-tight ml-1">Traffic</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
          <span className="text-[11px] text-gray-400 leading-none truncate">
            {subtitle ?? 'Madrid · sensores en vivo'}
          </span>
        </div>
      </div>
      <button className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-100 transition-colors">
        <Search size={14} className="text-gray-400" />
      </button>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-400 to-red-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 shadow-sm">
        AS
      </div>
    </header>
  )
}

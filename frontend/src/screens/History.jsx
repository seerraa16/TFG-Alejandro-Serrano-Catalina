import Header from '../components/Header'
import BottomNav from '../components/BottomNav'
import { TrendingDown, ChevronRight, BarChart2 } from 'lucide-react'

const HISTORY = [
  { id: 1, place: 'Central Station', date: 'Hoy', time: 18, status: 'Fluido', colorKey: 'green', icon: '✅' },
  { id: 2, place: 'Airport Terminal 2', date: '24 Oct', time: 52, status: 'Denso', colorKey: 'red', icon: '⚠️' },
  { id: 3, place: 'Home', date: '23 Oct', time: 31, status: 'Moderado', colorKey: 'amber', icon: '⏸️' },
  { id: 4, place: 'Global Tech Hub', date: '23 Oct', time: 12, status: 'Fluido', colorKey: 'green', icon: '✅' },
]

const STATUS_STYLES = {
  green: { bg: 'bg-green-100', text: 'text-green-700' },
  red: { bg: 'bg-red-100', text: 'text-red-700' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700' },
}

const BAR_HEIGHTS = [55, 40, 75, 50, 90, 38, 62, 70]

export default function History() {
  return (
    <div className="flex flex-col h-full bg-dots">
      <Header />

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide pb-4">

        {/* Card predicción mañana */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-semibold opacity-70 uppercase tracking-widest">Mañana a esta hora</p>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-semibold">Predicted</span>
          </div>

          <div className="flex items-end justify-between mt-1">
            <div>
              <p className="text-xs opacity-60 mb-1">🚗 Commute to Work</p>
              <div className="flex items-end gap-2">
                <p className="text-5xl font-bold leading-none">24</p>
                <p className="text-lg opacity-70 mb-0.5">min</p>
                <span className="mb-1 text-[11px] bg-green-400/30 text-green-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                  <TrendingDown size={10} />
                  -15% Traffic
                </span>
              </div>
            </div>
            <BarChart2 size={32} className="opacity-30 mb-1" />
          </div>

          {/* Mini gráfico de barras */}
          <div className="flex items-end gap-1 mt-3 h-10">
            {BAR_HEIGHTS.map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-sm transition-all ${i === 5 ? 'bg-white' : 'bg-white/25'}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>

          <p className="text-[10px] opacity-50 mt-2 leading-relaxed">
            Expected lighter traffic than today due to regional holiday.
          </p>
        </div>

        {/* Historial reciente */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="font-semibold text-gray-800 mb-3">Recent History</p>
          <div>
            {HISTORY.map((item) => {
              const sc = STATUS_STYLES[item.colorKey]
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${sc.bg}`}>
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{item.place}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{item.time} min</span>
                      <span className={`text-[10px] font-semibold ${sc.text}`}>● {item.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-gray-400">{item.date}</span>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Total semanal */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Total Commute Time</p>
              <p className="text-4xl font-bold text-gray-900 mt-1">
                12.4 <span className="text-lg font-normal text-gray-400">Hours</span>
              </p>
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <TrendingDown size={11} />
                Esta semana · -1.2h vs semana pasada
              </p>
            </div>
            <BarChart2 size={30} className="text-blue-500" />
          </div>
        </div>

        <div className="h-4" />
      </div>

      <BottomNav />
    </div>
  )
}
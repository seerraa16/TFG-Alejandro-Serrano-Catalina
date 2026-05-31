import { Search } from 'lucide-react'

export default function Header({ subtitle = null }) {
  return (
    <header style={{
      background: '#ffffff',
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
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11l18-8-8 18-2-8-8-2z" />
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, lineHeight: 1.1 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Predictive Traffic
          </span>
        </div>
        <div style={{
          fontSize: 11, color: 'var(--ink-3)',
          marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: 999,
            background: 'var(--success)',
            flexShrink: 0,
          }} />
          {subtitle ?? 'Madrid · sensores en vivo'}
        </div>
      </div>

      <button style={{
        width: 32, height: 32, borderRadius: 8,
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        color: 'var(--ink-3)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
      }}>
        <Search size={14} />
      </button>

      <div style={{
        width: 32, height: 32, borderRadius: 999, flexShrink: 0,
        background: '#2563eb',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 11.5, letterSpacing: '0.02em',
      }}>
        AS
      </div>
    </header>
  )
}

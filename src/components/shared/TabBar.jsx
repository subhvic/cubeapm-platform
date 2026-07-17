import { clsx } from 'clsx'

/**
 * Compact pill-style tab bar, one pattern, reused everywhere.
 * Matches: Home tabs (Detail/Health/Service Graph), service tabs, etc.
 */
export default function TabBar({ tabs, active, onChange, className = '' }) {
  return (
    <div className={clsx('flex items-center gap-1 p-1 bg-panel rounded-lg', className)}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'px-3 py-1.5 rounded-md text-[12.5px] transition-all duration-100 whitespace-nowrap',
            active === tab.id
              ? 'bg-brand-muted text-text-primary font-semibold'
              : 'text-text-secondary hover:text-text-primary hover:bg-panel-2'
          )}
        >
          {tab.label}
          {tab.count != null && (
            <span className="ml-1.5 text-[10px] text-text-muted">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

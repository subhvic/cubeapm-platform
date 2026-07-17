import { clsx } from 'clsx'

/**
 * General-purpose "card with a header row" container.
 * Used for tables, drilldown, slow requests, infra correlation, RED tab.
 */
export default function Panel({ title, hint, actions, children, className = '' }) {
  return (
    <div className={clsx('bg-panel border border-border-panel rounded-lg', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2 min-w-0">
            {title && (
              <h3 className="text-panel-header text-text-primary truncate">{title}</h3>
            )}
            {hint && (
              <span className="text-[11px] text-text-muted truncate">{hint}</span>
            )}
          </div>
          {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

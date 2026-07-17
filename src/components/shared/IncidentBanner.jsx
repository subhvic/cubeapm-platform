import { clsx } from 'clsx'
import { AlertTriangle } from 'lucide-react'
import { statusColor } from '@/utils/status'
import { timeAgo } from '@/utils/format'

/**
 * Left-border-accented incident banner - surfaces active-problem explanation
 * as a first-class element rather than burying it in a tooltip.
 */
export default function IncidentBanner({ incident, className = '' }) {
  if (!incident) return null

  const color = statusColor(incident.severity || 'critical')

  return (
    <div
      className={clsx(
        'flex items-start gap-3 px-4 py-3 rounded-md border-l-[3px]',
        'bg-critical/5 border-border-panel',
        className
      )}
      style={{ borderLeftColor: color }}
    >
      <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color }} />
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-text-primary">{incident.title}</div>
        {incident.rootCause && (
          <div className="text-[11.5px] text-text-secondary mt-1">{incident.rootCause}</div>
        )}
        {incident.since && (
          <div className="text-[10px] text-text-muted mt-1">Since {timeAgo(incident.since)}</div>
        )}
      </div>
    </div>
  )
}

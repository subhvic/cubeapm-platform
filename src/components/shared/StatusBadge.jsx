import { clsx } from 'clsx'
import { STATUS_LABELS } from '@/utils/status'

const BADGE_STYLES = {
  healthy: 'bg-healthy/10 text-healthy border-healthy/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  critical: 'bg-critical/10 text-critical border-critical/20',
  info: 'bg-info/10 text-info border-info/20',
  neutral: 'bg-neutral/10 text-neutral border-neutral/20',
}

export default function StatusBadge({ status, label, className = '' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-[11px] font-medium',
        BADGE_STYLES[status] || BADGE_STYLES.neutral,
        className
      )}
      title={`Status: ${STATUS_LABELS[status] || status}`}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full', `bg-status-${status}`)} />
      {label || STATUS_LABELS[status]}
    </span>
  )
}

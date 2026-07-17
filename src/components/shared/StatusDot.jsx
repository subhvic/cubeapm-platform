import { clsx } from 'clsx'
import { STATUS_LABELS } from '@/utils/status'

const SIZE_MAP = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
}

export default function StatusDot({ status, size = 'md', className = '' }) {
  return (
    <span
      className={clsx(
        'inline-block rounded-full shrink-0',
        `bg-status-${status}`,
        SIZE_MAP[size] || SIZE_MAP.md,
        className
      )}
      title={`Status: ${STATUS_LABELS[status] || status}`}
      role="img"
      aria-label={`Status: ${STATUS_LABELS[status] || status}`}
    />
  )
}

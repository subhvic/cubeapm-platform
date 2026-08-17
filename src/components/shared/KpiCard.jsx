import { clsx } from 'clsx'
import { statusColor, STATUS_LABELS } from '@/utils/status'
import Sparkline from '@/components/charts/Sparkline'

/**
 * KPI card - label + status chip + headline value (mono) + sparkline + threshold caption.
 * Color is ALWAYS resolved through status functions, never hardcoded.
 */
export default function KpiCard({
  label,
  value,
  unit = '',
  status,
  change,
  sparklineData,
  threshold,
  className = '',
}) {
  const color = statusColor(status)

  return (
    <div
      className={clsx(
        'bg-panel border rounded-lg p-4 flex flex-col gap-2 min-w-0',
        status === 'critical' ? 'border-critical/30' :
        status === 'warning' ? 'border-warning/30' :
        'border-border-panel',
        className
      )}
    >
      {/* Label + status chip */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium text-text-muted uppercase tracking-wide truncate">
          {label}
        </span>
        {status && status !== 'healthy' && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{ color, backgroundColor: `${color}15` }}
          >
            {change != null && change > 0 ? '↑ ' : ''}{STATUS_LABELS[status]}
          </span>
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-kpi-value font-mono"
          style={{ color }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[12px] text-text-muted">{unit}</span>
        )}
      </div>

      {/* Sparkline */}
      {sparklineData && (
        <div className="h-8 -mx-1">
          <Sparkline data={sparklineData} color={color} />
        </div>
      )}

      {/* Threshold caption */}
      {threshold && (
        <div className="text-[10px] text-text-muted">
          Threshold: {threshold}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Bell, CheckCircle } from 'lucide-react'
import { clsx } from 'clsx'
import TabBar from '@/components/shared/TabBar'
import StatusBadge from '@/components/shared/StatusBadge'
import { alerts, alertsSummary } from '@/data/alerts'
import { timeAgo } from '@/utils/format'
import { statusColor } from '@/utils/status'

const ALERT_TABS = [
  { id: 'all', label: 'All', count: alerts.length },
  { id: 'firing', label: 'Firing', count: alertsSummary.firing },
  { id: 'resolved', label: 'Resolved', count: alertsSummary.resolved },
]

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState('firing')

  const filtered = activeTab === 'all'
    ? alerts
    : alerts.filter(a => a.status === activeTab)

  return (
    <div className="p-5 space-y-5">
      {/* Summary */}
      <div className="flex items-center gap-3">
        {alertsSummary.critical > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-critical/5 border border-critical/20 rounded-lg">
            <Bell size={14} className="text-critical" />
            <span className="text-[14px] font-bold text-critical">{alertsSummary.critical}</span>
            <span className="text-[11px] text-critical/70">critical</span>
          </div>
        )}
        {alertsSummary.warning > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/5 border border-warning/20 rounded-lg">
            <span className="text-[14px] font-bold text-warning">{alertsSummary.warning}</span>
            <span className="text-[11px] text-warning/70">warning</span>
          </div>
        )}
        <div className="flex-1" />
        <TabBar tabs={ALERT_TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Alert list */}
      <div className="space-y-2">
        {filtered.map(alert => {
          const color = statusColor(alert.severity)
          const isFiring = alert.status === 'firing'

          return (
            <div
              key={alert.id}
              className={clsx(
                'bg-panel border rounded-lg px-4 py-3 transition-colors hover:border-border-strong cursor-pointer',
                isFiring ? 'border-l-[3px]' : 'border-border-panel'
              )}
              style={isFiring ? { borderLeftColor: color } : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-medium text-text-primary">{alert.name}</span>
                    <StatusBadge status={alert.severity} />
                    {!isFiring && (
                      <span className="flex items-center gap-1 text-[10px] text-healthy">
                        <CheckCircle size={11} /> Resolved
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-text-secondary">{alert.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-text-muted">
                    <span>Service: <span className="text-text-secondary">{alert.service}</span></span>
                    <span>Metric: <span className="text-text-secondary font-mono">{alert.metric}</span></span>
                    <span>Threshold: <span className="text-text-secondary font-mono">{alert.threshold}</span></span>
                    <span>Current: <span className="font-mono" style={{ color }}>{alert.currentValue}</span></span>
                  </div>
                </div>
                <div className="text-[10px] text-text-muted shrink-0 text-right">
                  <div>{isFiring ? 'Firing since' : 'Triggered'}</div>
                  <div className="text-text-secondary">{timeAgo(alert.triggeredAt)}</div>
                  {alert.resolvedAt && (
                    <>
                      <div className="mt-1">Resolved</div>
                      <div className="text-healthy">{timeAgo(alert.resolvedAt)}</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

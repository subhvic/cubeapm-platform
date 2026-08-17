import { useState } from 'react'
import { Filter } from 'lucide-react'
import Panel from '@/components/shared/Panel'
import TabBar from '@/components/shared/TabBar'
import { logs, LOG_LEVELS, LOG_LEVEL_COLORS } from '@/data/logs'
import { timeAgo } from '@/utils/format'

export default function LogsPage() {
  const [levelFilter, setLevelFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('')

  const uniqueServices = [...new Set(logs.map(l => l.service))]

  const filtered = logs.filter(l => {
    if (levelFilter !== 'all' && l.level !== levelFilter) return false
    if (serviceFilter && l.service !== serviceFilter) return false
    return true
  })

  const levelTabs = [
    { id: 'all', label: 'All', count: logs.length },
    ...LOG_LEVELS.map(lvl => ({
      id: lvl,
      label: lvl.charAt(0).toUpperCase() + lvl.slice(1),
      count: logs.filter(l => l.level === lvl).length,
    })),
  ]

  return (
    <div className="p-5 space-y-5">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <TabBar tabs={levelTabs} active={levelFilter} onChange={setLevelFilter} />
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-text-muted" />
          <select
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value)}
            className="h-8 px-3 bg-panel border border-border-panel rounded-md text-[12px] text-text-secondary focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            <option value="">All services</option>
            {uniqueServices.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Log entries - auto-loaded, NOT "click Search to see anything" */}
      <Panel title="Log Stream" hint="Auto-loaded - real-time tail">
        <div className="divide-y divide-border-subtle">
          {filtered.map(log => (
            <div key={log.id} className="px-4 py-2.5 hover:bg-panel-2/50 transition-colors group">
              <div className="flex items-start gap-3">
                {/* Level badge */}
                <span
                  className="shrink-0 mt-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded w-[42px] text-center"
                  style={{
                    color: LOG_LEVEL_COLORS[log.level],
                    backgroundColor: `${LOG_LEVEL_COLORS[log.level]}15`,
                  }}
                >
                  {log.level}
                </span>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-medium text-text-secondary">{log.service}</span>
                    <span className="text-[10px] text-text-muted">{timeAgo(log.timestamp)}</span>
                    {log.traceId && (
                      <span className="text-[10px] font-mono text-brand/60 group-hover:text-brand cursor-pointer">
                        trace:{log.traceId.slice(0, 8)}
                      </span>
                    )}
                  </div>
                  <pre className="text-[12px] text-text-primary font-mono whitespace-pre-wrap break-all leading-relaxed">
                    {log.message}
                  </pre>
                  {log.attributes && Object.keys(log.attributes).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {Object.entries(log.attributes).map(([k, v]) => (
                        <span key={k} className="text-[10px] text-text-muted bg-panel px-1.5 py-0.5 rounded">
                          {k}=<span className="text-text-secondary">{v}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

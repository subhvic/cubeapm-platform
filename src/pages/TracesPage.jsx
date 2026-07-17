import { useState } from 'react'
import { Activity, Filter } from 'lucide-react'
import Panel from '@/components/shared/Panel'
import DataTable from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import { traces, tracesSummary } from '@/data/traces'
import { formatDuration, timeAgo } from '@/utils/format'
import { statusForLatency } from '@/utils/status'

const TRACE_COLUMNS = [
  {
    key: 'rootSpan',
    label: 'Root Span',
    render: (val, row) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-text-primary font-mono text-[12px]">{val}</span>
        <span className="text-[10px] text-text-muted">{row.service}</span>
      </div>
    ),
    sortable: false,
  },
  {
    key: 'traceId',
    label: 'Trace ID',
    render: val => (
      <span className="font-mono text-[11px] text-text-muted">{val.slice(0, 12)}...</span>
    ),
    sortable: false,
  },
  {
    key: 'duration',
    label: 'Duration',
    align: 'right',
    render: (val, row) => {
      const status = statusForLatency(val)
      return <span className={`status-${status} font-mono`}>{formatDuration(val)}</span>
    },
  },
  {
    key: 'spanCount',
    label: 'Spans',
    align: 'right',
    render: val => <span className="text-text-secondary">{val}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    align: 'right',
    render: val => (
      <StatusBadge status={val === 'error' ? 'critical' : 'healthy'} label={val === 'error' ? 'Error' : 'OK'} />
    ),
    sortable: false,
  },
  {
    key: 'statusCode',
    label: 'HTTP',
    align: 'right',
    render: val => (
      <span className={val >= 400 ? 'text-critical font-mono' : 'text-text-muted font-mono'}>{val}</span>
    ),
  },
  {
    key: 'timestamp',
    label: 'When',
    align: 'right',
    render: val => <span className="text-text-muted text-[11px]">{timeAgo(val)}</span>,
    sortable: false,
  },
]

export default function TracesPage() {
  const [serviceFilter, setServiceFilter] = useState('')

  const filtered = serviceFilter
    ? traces.filter(t => t.service === serviceFilter)
    : traces

  const uniqueServices = [...new Set(traces.map(t => t.service))]

  return (
    <div className="p-5 space-y-5">
      {/* Summary */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-panel rounded-lg">
          <Activity size={14} className="text-brand" />
          <span className="text-[14px] font-bold text-text-primary">{tracesSummary.total}</span>
          <span className="text-[11px] text-text-muted">traces</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-critical/5 border border-critical/20 rounded-lg">
          <span className="text-[14px] font-bold text-critical">{tracesSummary.errors}</span>
          <span className="text-[11px] text-critical/70">errors</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-panel rounded-lg">
          <span className="text-[11px] text-text-muted">Avg</span>
          <span className="text-[13px] font-mono text-text-primary">{formatDuration(tracesSummary.avgDuration)}</span>
        </div>

        <div className="flex-1" />

        {/* Service filter */}
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

      {/* Traces table */}
      <Panel title="Recent Traces" hint="Auto-loaded - no search required">
        <DataTable columns={TRACE_COLUMNS} data={filtered} />
      </Panel>
    </div>
  )
}

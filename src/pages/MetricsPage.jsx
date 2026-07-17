import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import Panel from '@/components/shared/Panel'
import DataTable from '@/components/shared/DataTable'
import TabBar from '@/components/shared/TabBar'
import KpiCard from '@/components/shared/KpiCard'
import { globalMetrics, infraMetrics, topEndpoints } from '@/data/metrics'
import { formatLatency, formatThroughput, formatErrorRate } from '@/utils/format'
import { statusForLatency, statusForErrorRate } from '@/utils/status'

const METRICS_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'endpoints', label: 'Top Endpoints' },
  { id: 'infra', label: 'Infrastructure' },
]

const ENDPOINT_COLUMNS = [
  {
    key: 'endpoint',
    label: 'Endpoint',
    render: (val, row) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[12px] text-text-primary">{val}</span>
        <span className="text-[10px] text-text-muted">{row.service}</span>
      </div>
    ),
    sortable: false,
  },
  {
    key: 'latency',
    label: 'Latency',
    align: 'right',
    render: val => {
      const status = statusForLatency(val)
      return <span className={`status-${status} font-mono`}>{formatLatency(val)}</span>
    },
  },
  {
    key: 'throughput',
    label: 'Throughput',
    align: 'right',
    render: val => <span className="text-text-secondary font-mono">{formatThroughput(val)}</span>,
  },
  {
    key: 'errorRate',
    label: 'Error Rate',
    align: 'right',
    render: val => {
      const status = statusForErrorRate(val)
      return <span className={`status-${status} font-mono`}>{formatErrorRate(val)}</span>
    },
  },
]

const INFRA_COLUMNS = [
  {
    key: 'host',
    label: 'Host',
    render: val => <span className="font-medium text-text-primary">{val}</span>,
  },
  {
    key: 'cpu',
    label: 'CPU %',
    align: 'right',
    render: val => (
      <span className={val > 85 ? 'text-critical font-mono' : val > 70 ? 'text-warning font-mono' : 'text-text-secondary font-mono'}>
        {val}%
      </span>
    ),
  },
  {
    key: 'memory',
    label: 'Memory %',
    align: 'right',
    render: val => (
      <span className={val > 85 ? 'text-critical font-mono' : val > 70 ? 'text-warning font-mono' : 'text-text-secondary font-mono'}>
        {val}%
      </span>
    ),
  },
  {
    key: 'disk',
    label: 'Disk %',
    align: 'right',
    render: val => <span className="text-text-secondary font-mono">{val}%</span>,
  },
  {
    key: 'pods',
    label: 'Pods',
    align: 'right',
    render: val => <span className="text-text-muted">{val}</span>,
  },
]

export default function MetricsPage() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-3">
        <TabBar tabs={METRICS_TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <KpiCard
              label="Avg Latency"
              value={formatLatency(globalMetrics.latency.current)}
              status={statusForLatency(globalMetrics.latency.current)}
              change={globalMetrics.latency.change}
              sparklineData={globalMetrics.latency.series}
              threshold="< 500ms"
            />
            <KpiCard
              label="Throughput"
              value={formatThroughput(globalMetrics.throughput.current)}
              status="healthy"
              sparklineData={globalMetrics.throughput.series}
            />
            <KpiCard
              label="Error Rate"
              value={formatErrorRate(globalMetrics.errorRate.current)}
              status={statusForErrorRate(globalMetrics.errorRate.current)}
              change={globalMetrics.errorRate.change}
              sparklineData={globalMetrics.errorRate.series}
              threshold="< 1%"
            />
            <KpiCard
              label="P99 Latency"
              value={formatLatency(globalMetrics.p99Latency.current)}
              status={statusForLatency(globalMetrics.p99Latency.current)}
              change={globalMetrics.p99Latency.change}
              sparklineData={globalMetrics.p99Latency.series}
              threshold="< 1000ms"
            />
          </div>

          {/* Placeholder for time series charts - Recharts will render here */}
          <Panel title="Latency Over Time" hint="Last 1 hour">
            <div className="h-64 flex items-center justify-center text-text-muted text-body">
              <BarChart3 size={20} className="mr-2 opacity-50" />
              Recharts time series will render here after npm install
            </div>
          </Panel>
        </>
      )}

      {activeTab === 'endpoints' && (
        <Panel title="Top Endpoints by Latency" hint="Across all services">
          <DataTable columns={ENDPOINT_COLUMNS} data={topEndpoints} />
        </Panel>
      )}

      {activeTab === 'infra' && (
        <Panel title="Infrastructure Correlation" hint="App symptoms ↔ host metrics in one view">
          <DataTable columns={INFRA_COLUMNS} data={infraMetrics} />
        </Panel>
      )}
    </div>
  )
}

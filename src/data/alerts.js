/**
 * Mock alerts data
 */

export const alerts = [
  {
    id: 'alert-001',
    name: 'High Error Rate - order-service',
    status: 'firing',
    severity: 'critical',
    service: 'order-service',
    metric: 'error_rate',
    threshold: '> 2%',
    currentValue: '4.82%',
    triggeredAt: '2026-07-14T14:23:00Z',
    description: 'Error rate on order-service has exceeded 2% for more than 5 minutes',
  },
  {
    id: 'alert-002',
    name: 'P99 Latency SLO Breach - order-service',
    status: 'firing',
    severity: 'critical',
    service: 'order-service',
    metric: 'p99_latency',
    threshold: '> 1000ms',
    currentValue: '2100ms',
    triggeredAt: '2026-07-14T14:25:00Z',
    description: 'P99 latency on order-service has breached the 1000ms SLO',
  },
  {
    id: 'alert-003',
    name: 'Elevated Latency - analytics-service',
    status: 'firing',
    severity: 'warning',
    service: 'analytics-service',
    metric: 'avg_latency',
    threshold: '> 300ms',
    currentValue: '445ms',
    triggeredAt: '2026-07-14T13:45:00Z',
    description: 'Average latency on analytics-service exceeds warning threshold',
  },
  {
    id: 'alert-004',
    name: 'High Error Rate - analytics-service',
    status: 'resolved',
    severity: 'warning',
    service: 'analytics-service',
    metric: 'error_rate',
    threshold: '> 1%',
    currentValue: '0.45%',
    triggeredAt: '2026-07-14T12:00:00Z',
    resolvedAt: '2026-07-14T12:30:00Z',
    description: 'Error rate spike resolved after deployment rollback',
  },
  {
    id: 'alert-005',
    name: 'CPU Usage - node-4',
    status: 'firing',
    severity: 'warning',
    service: 'infrastructure',
    metric: 'cpu_percent',
    threshold: '> 85%',
    currentValue: '91%',
    triggeredAt: '2026-07-14T14:10:00Z',
    description: 'Node-4 CPU usage has been above 85% for 20 minutes',
  },
]

export const alertsSummary = {
  firing: alerts.filter(a => a.status === 'firing').length,
  resolved: alerts.filter(a => a.status === 'resolved').length,
  critical: alerts.filter(a => a.status === 'firing' && a.severity === 'critical').length,
  warning: alerts.filter(a => a.status === 'firing' && a.severity === 'warning').length,
}

/**
 * Mock metrics data - time series for charts
 */

function generateTimeSeries(base, variance, points = 30, interval = 60000) {
  const now = Date.now()
  return Array.from({ length: points }, (_, i) => ({
    time: new Date(now - (points - i) * interval).toISOString(),
    value: Math.max(0, base + (Math.random() - 0.5) * variance * 2),
  }))
}

export const globalMetrics = {
  latency: {
    label: 'Avg Latency',
    unit: 'ms',
    current: 142,
    previous: 98,
    change: +44.9,
    series: generateTimeSeries(120, 60),
  },
  throughput: {
    label: 'Throughput',
    unit: 'req/min',
    current: 32847,
    previous: 31200,
    change: +5.3,
    series: generateTimeSeries(32000, 3000),
  },
  errorRate: {
    label: 'Error Rate',
    unit: '%',
    current: 1.24,
    previous: 0.31,
    change: +300,
    series: generateTimeSeries(0.8, 1.2),
  },
  p99Latency: {
    label: 'P99 Latency',
    unit: 'ms',
    current: 2100,
    previous: 890,
    change: +136,
    series: generateTimeSeries(1200, 800),
  },
}

export const infraMetrics = [
  { host: 'node-1', cpu: 34, memory: 62, disk: 45, network: 12, pods: 8 },
  { host: 'node-2', cpu: 78, memory: 81, disk: 52, network: 34, pods: 6 },
  { host: 'node-3', cpu: 22, memory: 44, disk: 38, network: 8, pods: 5 },
  { host: 'node-4', cpu: 91, memory: 87, disk: 71, network: 56, pods: 10 },
]

export const topEndpoints = [
  { endpoint: 'POST /api/v1/orders', service: 'order-service', latency: 612, throughput: 203, errorRate: 4.82 },
  { endpoint: 'GET /api/v1/users/me', service: 'user-service', latency: 87, throughput: 3102, errorRate: 0.08 },
  { endpoint: 'POST /api/v1/payments', service: 'payment-service', latency: 234, throughput: 891, errorRate: 0.34 },
  { endpoint: 'GET /api/v1/search', service: 'search-service', latency: 34, throughput: 1876, errorRate: 0.05 },
  { endpoint: 'GET /api/v1/analytics/dashboard', service: 'analytics-service', latency: 445, throughput: 234, errorRate: 1.23 },
]

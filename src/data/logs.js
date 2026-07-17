/**
 * Mock log entries - auto-loaded, not "click Search to see anything"
 */

export const logs = [
  {
    id: 'log-001',
    timestamp: '2026-07-14T14:32:01.234Z',
    level: 'error',
    service: 'order-service',
    message: 'Connection pool exhausted: orders-db replica-2. Max connections: 50, active: 50, waiting: 23',
    traceId: 'abc-1234-def-5678',
    attributes: { host: 'order-svc-pod-3a2f', db: 'orders-db', pool: 'replica-2' },
  },
  {
    id: 'log-002',
    timestamp: '2026-07-14T14:32:00.891Z',
    level: 'error',
    service: 'order-service',
    message: 'POST /api/v1/orders failed: 500 Internal Server Error - database connection timeout after 30000ms',
    traceId: 'abc-1234-def-5678',
    attributes: { host: 'order-svc-pod-3a2f', endpoint: '/api/v1/orders', method: 'POST' },
  },
  {
    id: 'log-003',
    timestamp: '2026-07-14T14:31:58.456Z',
    level: 'warn',
    service: 'order-service',
    message: 'Slow query detected: SELECT * FROM orders WHERE user_id = $1 - 1823ms (threshold: 500ms)',
    attributes: { host: 'order-svc-pod-1b4e', query_time_ms: 1823 },
  },
  {
    id: 'log-004',
    timestamp: '2026-07-14T14:31:55.123Z',
    level: 'info',
    service: 'api-gateway',
    message: 'Rate limit approaching: order-service circuit breaker at 80% threshold (40/50 failures in 60s window)',
    attributes: { host: 'gw-pod-2c1a', circuit: 'order-service' },
  },
  {
    id: 'log-005',
    timestamp: '2026-07-14T14:31:50.789Z',
    level: 'info',
    service: 'payment-service',
    message: 'Payment processed successfully: order_id=ORD-29481, amount=$142.50, provider=stripe',
    traceId: 'mno-7890-pqr-1234',
    attributes: { host: 'pay-pod-1a3f', order_id: 'ORD-29481' },
  },
  {
    id: 'log-006',
    timestamp: '2026-07-14T14:31:45.234Z',
    level: 'debug',
    service: 'cache-service',
    message: 'Cache hit: user:1234 - TTL remaining: 847s',
    traceId: 'ghi-9012-jkl-3456',
    attributes: { host: 'cache-pod-1', key: 'user:1234' },
  },
  {
    id: 'log-007',
    timestamp: '2026-07-14T14:31:40.567Z',
    level: 'warn',
    service: 'analytics-service',
    message: 'Query execution time exceeds SLO: dashboard aggregation took 1890ms (SLO: 1000ms)',
    attributes: { host: 'analytics-pod-1', query: 'dashboard_aggregation' },
  },
  {
    id: 'log-008',
    timestamp: '2026-07-14T14:31:35.890Z',
    level: 'info',
    service: 'auth-service',
    message: 'Token refresh: user_id=1234, session extended by 3600s',
    attributes: { host: 'auth-pod-2a1b', user_id: '1234' },
  },
]

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug']

export const LOG_LEVEL_COLORS = {
  error: '#EF4444',
  warn: '#F59E0B',
  info: '#60A5FA',
  debug: '#616C86',
}

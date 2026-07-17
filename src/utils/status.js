export const STATUS = {
  healthy: 'healthy',
  warning: 'warning',
  critical: 'critical',
  info: 'info',
  neutral: 'neutral',
}

export const STATUS_COLORS = {
  healthy: '#22C55E',
  warning: '#F59E0B',
  critical: '#EF4444',
  info: '#60A5FA',
  neutral: '#616C86',
}

export const STATUS_LABELS = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  info: 'Info',
  neutral: 'No Data',
}

const THRESHOLDS = {
  latencyP90Ms: { warn: 150, critical: 300 },
  errorRatePct: { warn: 1, critical: 3 },
}

export function statusForLatency(ms) {
  if (ms == null) return STATUS.neutral
  if (ms >= THRESHOLDS.latencyP90Ms.critical) return STATUS.critical
  if (ms >= THRESHOLDS.latencyP90Ms.warn) return STATUS.warning
  return STATUS.healthy
}

export function statusForErrorRate(pct) {
  if (pct == null) return STATUS.neutral
  if (pct >= THRESHOLDS.errorRatePct.critical) return STATUS.critical
  if (pct >= THRESHOLDS.errorRatePct.warn) return STATUS.warning
  return STATUS.healthy
}

export function worstStatus(...statuses) {
  const order = [STATUS.critical, STATUS.warning, STATUS.healthy, STATUS.info, STATUS.neutral]
  for (const s of order) {
    if (statuses.includes(s)) return s
  }
  return STATUS.neutral
}

export function statusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.neutral
}

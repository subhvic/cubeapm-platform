/**
 * A trace, built from its id.
 *
 * The prototype has no trace store, and a link from a log record has to land
 * on *that record's* trace rather than a stand-in - otherwise the deep link
 * demonstrates nothing. So a trace is derived deterministically from its id,
 * and when a seeded record carries that id its service, endpoint and duration
 * become the root span. The same id always produces the same trace.
 *
 * Shapes follow what the playground actually returns: a server root, client
 * spans for outbound HTTP and database calls, and internal spans in between.
 */

import { logRows } from './observability'
import { valueOfConcept } from '@/utils/logFields'

const rndFrom = (seed) => {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

const seedOf = (traceId) => {
  let h = 0
  for (let i = 0; i < traceId.length; i++) h = (h * 31 + traceId.charCodeAt(i)) | 0
  return Math.abs(h) || 7
}

const hex = (rnd, len) =>
  Array.from({ length: len }, () => Math.floor(rnd() * 16).toString(16)).join('')

const DB_TARGETS = [
  { system: 'mysql', name: 'cubedemo', op: 'SELECT', table: 'orders', peer: 'cubedemo.abcdefgh.us-west-2.rds.amazonaws.com', port: '3306' },
  { system: 'mysql', name: 'cubedemo', op: 'INSERT', table: 'notify', peer: 'cubedemo.abcdefgh.us-west-2.rds.amazonaws.com', port: '3306' },
  { system: 'redis', name: '0', op: 'GET', key: 'cubedemo:cart', peer: 'cubedemo.abcdefgh.us-west-2.cache.amazonaws.com', port: '6379' },
  { system: 'mongodb', name: 'cubedemo', op: 'find', collection: 'search', peer: 'cubedemo.abcdefgh.docdb.amazonaws.com', port: '27017' },
]

const EXTERNAL = [
  'POST api.twilio.com/v1/sendSMS',
  'GET maps.googleapis.com/v1/',
  'POST notify.cubedemo.com/v1/search',
]

const DOWNSTREAM = ['payment-service', 'notify-service', 'search-service', 'analytics-service', 'shipment-service']

/** The seeded log record that carries this trace id, if there is one. */
export function recordForTrace(traceId) {
  return logRows.find(r => valueOfConcept(r, 'traceId') === traceId) ?? null
}

export function buildTrace(traceId) {
  if (!traceId) return null
  const rnd = rndFrom(seedOf(traceId))
  const origin = recordForTrace(traceId)

  const rootService = origin?.service || DOWNSTREAM[Math.floor(rnd() * DOWNSTREAM.length)]
  const rootName = origin
    ? (valueOfConcept(origin, 'endpoint') || origin.tags?.root_name || 'GET /v1/request')
    : 'GET /v1/request'
  const failed = origin ? origin.level === 'error' : rnd() < 0.25

  const declaredMs = Number(valueOfConcept(origin, 'duration'))
  const totalMs = Number.isFinite(declaredMs) && declaredMs > 0
    ? (declaredMs > 100000 ? declaredMs / 1e6 : declaredMs)
    : Math.round(60 + rnd() * 900)

  const spans = []
  const push = (s) => { spans.push(s); return s }

  const root = push({
    id: hex(rnd, 16), parentId: null, depth: 0,
    name: rootName, service: rootService, kind: 'server',
    start: 0, duration: totalMs,
    status: failed ? 'error' : 'ok',
    tags: {
      'span.kind': 'server',
      'http.method': rootName.split(' ')[0],
      'http.route': rootName.split(' ')[1] ?? '/',
      'http.status_code': failed ? '500' : '200',
      'service.version': 'v8.31.9',
      'host.name': origin?.tags?.['host.name'] || 'ip-10-0-129-151',
      'net.peer.ip': '13.34.54.18',
    },
  })

  // Children fill the root's span, in order, never overrunning it.
  const childCount = 2 + Math.floor(rnd() * 3)
  let cursor = totalMs * 0.04
  for (let i = 0; i < childCount; i++) {
    const remaining = totalMs * 0.94 - cursor
    if (remaining <= 2) break
    const share = remaining / (childCount - i)
    const dur = Math.max(1, Math.round(share * (0.45 + rnd() * 0.5)))
    const isLast = i === childCount - 1
    const pick = rnd()

    if (pick < 0.42) {
      const db = DB_TARGETS[Math.floor(rnd() * DB_TARGETS.length)]
      const target = db.table || db.collection || db.key
      push({
        id: hex(rnd, 16), parentId: root.id, depth: 1,
        name: db.system === 'redis' ? `${db.op} ${db.key}` : `${db.op} ${db.name}.${target}`,
        service: rootService, kind: 'client',
        start: Math.round(cursor), duration: dur,
        status: failed && isLast ? 'error' : 'ok',
        db: true,
        tags: {
          'span.kind': 'client', 'db.system': db.system, 'db.name': db.name,
          'db.operation': db.op,
          'db.statement': db.system === 'redis'
            ? `${db.op} ${db.key}`
            : `${db.op.toLowerCase()} * from \`${target}\` where \`id\` = ?`,
          ...(db.table ? { 'db.sql.table': db.table } : {}),
          'net.peer.name': db.peer, 'net.peer.port': db.port,
        },
      })
    } else if (pick < 0.72) {
      const name = EXTERNAL[Math.floor(rnd() * EXTERNAL.length)]
      push({
        id: hex(rnd, 16), parentId: root.id, depth: 1,
        name, service: rootService, kind: 'client',
        start: Math.round(cursor), duration: dur,
        status: 'ok',
        tags: {
          'span.kind': 'client', 'http.method': name.split(' ')[0],
          'http.url': `https://${name.split(' ')[1]}`, 'http.status_code': '200',
        },
      })
    } else {
      // A downstream service: its own server span, plus one child of its own.
      const svc = DOWNSTREAM[Math.floor(rnd() * DOWNSTREAM.length)]
      const parent = push({
        id: hex(rnd, 16), parentId: root.id, depth: 1,
        name: `POST /v1/${svc.split('-')[0]}`, service: svc, kind: 'server',
        start: Math.round(cursor), duration: dur,
        status: failed && isLast ? 'error' : 'ok',
        tags: {
          'span.kind': 'server', 'http.method': 'POST',
          'http.route': `/v1/${svc.split('-')[0]}`,
          'http.status_code': failed && isLast ? '500' : '200',
          'service.version': 'v8.31.9',
        },
      })
      if (dur > 6) {
        const db = DB_TARGETS[Math.floor(rnd() * DB_TARGETS.length)]
        const target = db.table || db.collection || db.key
        push({
          id: hex(rnd, 16), parentId: parent.id, depth: 2,
          name: db.system === 'redis' ? `${db.op} ${db.key}` : `${db.op} ${db.name}.${target}`,
          service: svc, kind: 'client',
          start: Math.round(cursor + dur * 0.2), duration: Math.max(1, Math.round(dur * 0.5)),
          status: 'ok', db: true,
          tags: {
            'span.kind': 'client', 'db.system': db.system, 'db.name': db.name,
            'db.operation': db.op, 'net.peer.name': db.peer, 'net.peer.port': db.port,
          },
        })
      }
    }
    cursor += dur + totalMs * 0.01
  }

  if (failed) {
    const last = spans[spans.length - 1]
    last.status = 'error'
    last.tags['error.type'] = valueOfConcept(origin, 'exceptionType') || 'ConnectionRefusedException'
    last.tags['error.message'] = origin?.message || 'Failed connecting to database'
  }

  return {
    traceId,
    root,
    spans,
    totalMs,
    failed,
    origin,
    startTime: origin?.time ?? new Date(),
    services: [...new Set(spans.map(s => s.service))],
  }
}

/** Rolled up the way the playground's Summary tab does: by operation. */
export function traceSummary(trace) {
  const byName = new Map()
  for (const s of trace.spans) {
    if (s === trace.root) continue
    const e = byName.get(s.name) ?? { name: s.name, count: 0, duration: 0, db: !!s.db }
    e.count++; e.duration += s.duration
    byName.set(s.name, e)
  }
  return [...byName.values()]
    .map(e => ({ ...e, pct: trace.totalMs ? (e.duration / trace.totalMs) * 100 : 0 }))
    .sort((a, b) => b.duration - a.duration)
}

import { useState, useMemo } from 'react'
import PageBar from '@/components/layout/PageBar'
import StatusBadge from '@/components/shared/StatusBadge'
import { buildTrace, traceSummary } from '@/data/traceDetail'
import { formatDuration } from '@/utils/format'

const TABS = ['summary', 'database', 'errors']

// Bar colour carries the span's role, not its severity - a client call is not
// worse than a server one. Failure is said with the error colour and a badge,
// which is the only place severity is allowed to appear.
const KIND_COLOR = { server: 'var(--brand)', client: '#8B7BE8', internal: '#3FA9B8' }

function Waterfall({ trace, selected, onSelect }) {
  return (
    <div className="tw-rows">
      {trace.spans.map(span => {
        const left = trace.totalMs ? (span.start / trace.totalMs) * 100 : 0
        const width = trace.totalMs ? Math.max(0.6, (span.duration / trace.totalMs) * 100) : 0
        const isSel = selected?.id === span.id
        return (
          <button
            type="button"
            key={span.id}
            className={`tw-row${isSel ? ' is-selected' : ''}`}
            onClick={() => onSelect(span)}
            aria-pressed={isSel}
          >
            <span className="tw-label" style={{ paddingLeft: `${span.depth * 14}px` }}>
              <span className="tw-dot" style={{ background: span.status === 'error' ? 'var(--status-critical)' : KIND_COLOR[span.kind] }} />
              <span className="tw-name mono">{span.name}</span>
              <span className="tw-svc">{span.service}</span>
            </span>
            <span className="tw-track">
              <span
                className={`tw-bar${span.status === 'error' ? ' is-error' : ''}`}
                style={{ left: `${left}%`, width: `${width}%`, background: span.status === 'error' ? 'var(--status-critical)' : KIND_COLOR[span.kind] }}
              />
            </span>
            <span className="tw-dur mono">{formatDuration(span.duration)}</span>
          </button>
        )
      })}
    </div>
  )
}

function SummaryTab({ trace }) {
  const rows = useMemo(() => traceSummary(trace), [trace])
  if (!rows.length) return <div className="tw-empty">This trace has a root span and nothing else.</div>
  return (
    <table className="tw-table">
      <thead><tr><th>Operation</th><th className="num">Count</th><th className="num">Duration</th><th className="num">Duration %</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.name}>
            <td className="mono">{r.name}</td>
            <td className="num mono">{r.count}</td>
            <td className="num mono">{formatDuration(r.duration)}</td>
            <td className="num mono">{r.pct.toFixed(1)} %</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DatabaseTab({ trace }) {
  const rows = trace.spans.filter(s => s.db)
  if (!rows.length) return <div className="tw-empty">No database calls in this trace.</div>
  return (
    <table className="tw-table">
      <thead><tr><th>Statement</th><th>System</th><th>Instance</th><th className="num">Duration</th></tr></thead>
      <tbody>
        {rows.map(s => (
          <tr key={s.id}>
            <td className="mono tw-stmt">{s.tags['db.statement'] ?? s.name}</td>
            <td className="mono">{s.tags['db.system']}</td>
            <td className="mono dim">{s.tags['net.peer.name']}:{s.tags['net.peer.port']}</td>
            <td className="num mono">{formatDuration(s.duration)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ErrorsTab({ trace }) {
  const rows = trace.spans.filter(s => s.status === 'error')
  if (!rows.length) return <div className="tw-empty">No span in this trace failed.</div>
  return (
    <table className="tw-table">
      <thead><tr><th>Span</th><th>Service</th><th>Error</th></tr></thead>
      <tbody>
        {rows.map(s => (
          <tr key={s.id}>
            <td className="mono">{s.name}</td>
            <td className="mono">{s.service}</td>
            <td className="mono">{s.tags['error.type'] ?? s.tags['http.status_code'] ?? '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SpanDetails({ span, trace }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const tags = Object.entries(span.tags)
    .filter(([k, v]) => !needle || k.toLowerCase().includes(needle) || String(v).toLowerCase().includes(needle))
  return (
    <aside className="tw-side">
      <div className="tw-side-head">
        <div className="tw-side-svc">{span.service}</div>
        <div className="tw-side-name mono">{span.name}</div>
      </div>
      <dl className="tw-side-meta">
        <dt>Parent ID</dt><dd className="mono">{span.parentId ?? 'none'}</dd>
        <dt>Span ID</dt><dd className="mono">{span.id}</dd>
        <dt>Start</dt><dd className="mono">+{formatDuration(span.start)} into the trace</dd>
        <dt>Duration</dt><dd className="mono">{formatDuration(span.duration)}</dd>
      </dl>
      <div className="tw-side-tags">
        <div className="tw-side-tagbar">
          <span>Tags</span>
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search tags…" aria-label="Search tags" spellCheck={false}
          />
        </div>
        {tags.length === 0
          ? <div className="tw-empty">No tag matches {q}</div>
          : tags.map(([k, v]) => (
            <div className="tw-tag" key={k}>
              <div className="tw-tag-k mono">{k}</div>
              <div className="tw-tag-v mono">{String(v)}</div>
            </div>
          ))}
      </div>
      {trace.origin && (
        <div className="tw-side-origin">
          Opened from a log record on <span className="mono">{trace.origin.service || 'this trace'}</span>.
        </div>
      )}
    </aside>
  )
}

export default function TraceDetail({ traceId, goHome, goLogs, timeRange, setTimeRange, settingsOpen, setSettingsOpen }) {
  const trace = useMemo(() => buildTrace(traceId), [traceId])
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('summary')

  if (!trace) {
    return (
      <>
        <PageBar timeRange={timeRange} setTimeRange={setTimeRange}>
          <a onClick={goHome}>CubeAPM</a><span className="sep">/</span><span className="current">Trace</span>
        </PageBar>
        <div className="tw-main"><div className="tw-empty">No trace id in the URL.</div></div>
      </>
    )
  }

  const span = selected ?? trace.root

  return (
    <>
      <PageBar
        timeRange={timeRange} setTimeRange={setTimeRange}
        showSettings settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen}
      >
        <a onClick={goHome}>CubeAPM</a>
        <span className="sep">/</span>
        <a onClick={goHome}>APM &amp; Services</a>
        <span className="sep">/</span>
        <span className="current mono">Trace {trace.traceId.slice(0, 12)}…</span>
      </PageBar>

      <div className="tw-head">
        <div className="tw-head-left">
          <StatusBadge status={trace.failed ? 'critical' : 'healthy'} label={trace.failed ? 'Error' : 'OK'} />
          <h1 className="mono">{trace.traceId}</h1>
          <div className="tw-head-sub">
            {trace.spans.length} spans across {trace.services.length} service{trace.services.length === 1 ? '' : 's'}
            <span className="sep">&middot;</span>
            {formatDuration(trace.totalMs)}
            <span className="sep">&middot;</span>
            {trace.startTime.toISOString()}
          </div>
        </div>
        {/* The reverse of the link that got you here: the drawer sends you to
            the trace, and the trace sends you back to every log it produced. */}
        <button type="button" className="tw-checklogs" onClick={() => goLogs(trace.traceId)}>
          Check logs for this trace
        </button>
      </div>

      <div className="tw-main">
        <div className="tw-left">
          <div className="tw-tabs" role="tablist">
            {TABS.map(t => (
              <button key={t} role="tab" aria-selected={tab === t}
                className={`tw-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {t[0].toUpperCase() + t.slice(1)}
                {t === 'errors' && trace.failed && <span className="tw-tab-dot" />}
              </button>
            ))}
          </div>
          <div className="tw-tabbody">
            {tab === 'summary' && <SummaryTab trace={trace} />}
            {tab === 'database' && <DatabaseTab trace={trace} />}
            {tab === 'errors' && <ErrorsTab trace={trace} />}
          </div>
          <div className="tw-wf-head">Waterfall <span className="dim">click a span to inspect it</span></div>
          <Waterfall trace={trace} selected={span} onSelect={setSelected} />
        </div>
        <SpanDetails span={span} trace={trace} />
      </div>
    </>
  )
}

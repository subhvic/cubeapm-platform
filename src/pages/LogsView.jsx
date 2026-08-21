import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ResponsiveContainer } from 'recharts'
import { logRows, logVolume, logFacets, BASE_TIME } from '@/data/observability'
import PageBar from '@/components/layout/PageBar'
import QueryBuilder, { applyChipsToLog, chipsToString, FIELD_CATALOG, getFieldValue } from '@/components/QueryBuilder'
import { flattenLeaves } from '@/utils/queryTree'
import { aggregate } from '@/utils/aggregator'
import AggregateResults from '@/components/AggregateResults'
import { serializePipes, newStatsPipe, newStatsFunction, newSortPipe, newLimitPipe, newMathPipe, namesInScopeBefore } from '@/utils/pipes'
import { tryParseConditions, splitQuery, replacePipeSection, validatePipeText } from '@/utils/rawQuery'
import PipePill, { PipePillChip } from '@/components/PipePill'
import AggregationPopover from '@/components/AggregationPopover'
import GroupByPopover from '@/components/GroupByPopover'
import OrderPopover from '@/components/OrderPopover'
import LimitPopover from '@/components/LimitPopover'
import MathPopover from '@/components/MathPopover'
import { Sigma, Network, ArrowUpDown, Hash, Calculator } from 'lucide-react'

const AGG_ALL_FIELDS = FIELD_CATALOG.map(f => f.field)
const AGG_NUMERIC_FIELDS = new Set(FIELD_CATALOG.filter(f => f.type === 'keyword').map(f => f.field))

// Compact chip display for a saved stats function inside the Aggregation pill.
function summarizeFn(f) {
  if (f.as) return f.as
  if (f.fn === 'quantile') return `q${Math.round((Number(f.p) || 0.9) * 100)}(${f.field || '·'})`
  if (f.field) return `${f.fn}(${f.field})`
  return `${f.fn}()`
}

// Full-form title used on hover (fn call + alias when present).
function fullFn(f) {
  const args = []
  if (f.fn === 'quantile') args.push(Number(f.p) || 0.9)
  if (f.field) args.push(f.field)
  const call = `${f.fn}(${args.join(', ')})`
  return f.as ? `${f.as} = ${call}` : call
}


function VolumeTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const rec = payload[0]?.payload
  if (!rec) return null
  return (
    <div style={{ background: 'var(--raised)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px', fontSize: 11, minWidth: 130 }}>
      <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#EF4444', display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>error</span><span style={{ fontWeight: 600 }}>{rec.error}</span></div>
      <div style={{ color: '#F59E0B', display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>warn</span><span style={{ fontWeight: 600 }}>{rec.warn}</span></div>
      <div style={{ color: '#60A5FA', display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>info</span><span style={{ fontWeight: 600 }}>{rec.info}</span></div>
      <div style={{ borderTop: '1px solid var(--border-panel)', marginTop: 5, paddingTop: 5, color: 'var(--text-primary)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>total</span><span>{rec.total}</span>
      </div>
    </div>
  )
}

// Rows visible before the facet list starts scrolling.
const FACET_VISIBLE_ROWS = 6

// 'chip'  — inline eye toggle riding on the "N selected" count.
// 'link'  — separate text link on its own line under the meta row.
function FacetGroup({ title, options, selected, onToggle, toggleVariant = 'chip' }) {
  const [open, setOpen] = useState(true)
  const [q, setQ] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)

  const selectedCount = options.filter(o => selected.has(o.value)).length

  // Unchecking the last value while filtered to selections would strand the user
  // on an empty list, so drop back to showing everything.
  useEffect(() => {
    if (onlySelected && selectedCount === 0) setOnlySelected(false)
  }, [onlySelected, selectedCount])

  const searched = q ? options.filter(o => o.value.toLowerCase().includes(q.toLowerCase())) : options
  const shown = onlySelected ? searched.filter(o => selected.has(o.value)) : searched
  const scrollable = shown.length > FACET_VISIBLE_ROWS

  return (
    <div className="facet-group">
      <div className="facet-head" onClick={() => setOpen(o => !o)}>
        <div>
          <div className="facet-title">{title}</div>
          <div className="facet-meta">
            <div className="facet-meta-left">
              <span>{options.length} total ·</span>
              {toggleVariant === 'link' || selectedCount === 0 ? (
                // In the 'link' variant this count is just a label — the separate
                // "Show selected only" link carries the action — so keep it black
                // rather than brand-blue, which would imply it's clickable.
                <span className={selectedCount ? (toggleVariant === 'link' ? 'facet-meta-count' : 'facet-meta-hi') : undefined}>{selectedCount} selected</span>
              ) : (
                <button
                  type="button"
                  className={`facet-sel-toggle${onlySelected ? ' on' : ''}`}
                  aria-pressed={onlySelected}
                  title={onlySelected
                    ? `Showing only selected — click to show all ${options.length} values`
                    : `Show only the ${selectedCount} selected value${selectedCount === 1 ? '' : 's'}`}
                  onClick={(e) => { e.stopPropagation(); setOpen(true); setOnlySelected(v => !v) }}
                >
                  {selectedCount} selected
                  {onlySelected ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  )}
                </button>
              )}
            </div>
            {selectedCount > 0 && (
              <button
                type="button"
                className="facet-clear-btn-meta"
                title="Clear selected"
                onClick={(e) => { e.stopPropagation(); [...selected].forEach(v => onToggle(title, v)) }}
              >
                <span>Clear</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>
          {toggleVariant === 'link' && selectedCount > 0 && open && (
            <button
              type="button"
              className="facet-sel-link"
              aria-pressed={onlySelected}
              onClick={(e) => { e.stopPropagation(); setOpen(true); setOnlySelected(v => !v) }}
            >
              {onlySelected ? 'Show all' : 'Show selected only'}
            </button>
          )}
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`facet-chev${open ? ' open' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
      </div>
      {open && (
        <>
          <div className="facet-search">
            <input placeholder="search…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className={`facet-list${scrollable ? ' scrollable' : ''}`}>
            {shown.length === 0 && <div className="facet-none">No values match</div>}
            {shown.map(o => (
              <label key={o.value} className="facet-opt">
                <input type="checkbox" checked={selected.has(o.value)} onChange={() => onToggle(title, o.value)} />
                <span className="facet-opt-label" title={o.value}>{o.value}</span>
                <span className="facet-opt-count">{o.count.toLocaleString()}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const EXTRA_FIELDS = [
  { key: 'endpoint', label: 'endpoint' },
  { key: 'log.exception.type', label: 'log.exception.type' },
  { key: 'log.level', label: 'log.level' },
  { key: 'log.stacktrace', label: 'log.stacktrace' },
  { key: 'path', label: 'path' },
  { key: 'service', label: 'service' },
  { key: 'trace_id', label: 'trace_id' },
]

const DEFAULT_FIELDS = new Set()

function FieldsDropdown({ activeFields, setActiveFields }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const shown = q ? EXTRA_FIELDS.filter(f => f.label.toLowerCase().includes(q.toLowerCase())) : EXTRA_FIELDS
  const count = activeFields.size

  return (
    <div className="fields-drop-wrap" ref={ref}>
      <button className={`hbtn small${open ? ' active' : ''}`} onClick={() => setOpen(o => !o)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        Fields{count ? ` (${count})` : ''}
      </button>
      {open && (
        <div className="fields-drop">
          <div className="fields-drop-head">
            <span>Fields ({count})</span>
            <button
              className="fields-drop-select-all"
              onClick={() => setActiveFields(count === EXTRA_FIELDS.length ? new Set() : new Set(EXTRA_FIELDS.map(f => f.key)))}
            >
              {count === EXTRA_FIELDS.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="fields-drop-search">
            <input placeholder="search" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {shown.map(f => (
            <label key={f.key} className="fields-drop-opt">
              <input
                type="checkbox"
                checked={activeFields.has(f.key)}
                onChange={() => {
                  const next = new Set(activeFields)
                  if (next.has(f.key)) next.delete(f.key); else next.add(f.key)
                  setActiveFields(next)
                }}
              />
              {f.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

const QUERY_HISTORY = (() => {
  const now = BASE_TIME.getTime()
  return [
    { id: 1, query: 'service:payment AND log.level:error', time: new Date(now - 4 * 60000), results: 23, saved: 'Payment errors', actions: ['Created alert', 'Exported CSV'] },
    { id: 2, query: 'http.status:5* AND service:order', time: new Date(now - 18 * 60000), results: 87, saved: null, actions: ['Shared link'] },
    { id: 3, query: 'log.level:error', time: new Date(now - 42 * 60000), results: 119, saved: 'All errors', actions: [] },
    { id: 4, query: '"Failed connecting to database"', time: new Date(now - 1.5 * 3600000), results: 34, saved: null, actions: ['Created alert'] },
    { id: 5, query: 'service:search AND log.level!=info', time: new Date(now - 2.1 * 3600000), results: 56, saved: null, actions: [] },
    { id: 6, query: 'endpoint:/v1/payment AND http.status:408', time: new Date(now - 3 * 3600000), results: 12, saved: 'Payment timeouts', actions: ['Exported CSV'] },
    { id: 7, query: 'k8s.namespace.name:production AND log.level:warn', time: new Date(now - 5 * 3600000), results: 203, saved: null, actions: [] },
    { id: 8, query: 'trace_id:abc123*', time: new Date(now - 7 * 3600000), results: 8, saved: null, actions: ['Opened trace'] },
    { id: 9, query: 'service:shipment AND "timeout"', time: new Date(now - 12 * 3600000), results: 41, saved: 'Shipment timeouts', actions: ['Created alert', 'Shared link'] },
    { id: 10, query: 'log.exception.type:NullPointerException', time: new Date(now - 18 * 3600000), results: 15, saved: null, actions: [] },
    { id: 11, query: 'path:/v1/order AND log.level:error', time: new Date(now - 24 * 3600000), results: 67, saved: null, actions: ['Exported CSV'] },
    { id: 12, query: 'service:payment AND "Transaction committed"', time: new Date(now - 36 * 3600000), results: 340, saved: null, actions: [] },
  ]
})()

function formatHistoryTime(d) {
  const now = BASE_TIME.getTime()
  const diff = now - d.getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

// `savedNames` maps history id → saved name (or null). It's owned by LogsView so
// a save survives closing the drawer; QUERY_HISTORY only seeds the initial values.
function QueryHistoryDrawer({ onClose, onApply /*, savedNames, onToggleSave — disabled, kept for future restoration */ }) {
  const [search, setSearch] = useState('')

  const items = QUERY_HISTORY.filter(h => {
    if (search && !h.query.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="alert-drawer-overlay" onClick={onClose}>
      <aside className="alert-drawer qh-drawer" onClick={e => e.stopPropagation()}>
        <div className="alert-drawer-head">
          <div>
            <div className="alert-drawer-title">Query History</div>
            <div className="alert-drawer-sub">Recent queries run on this workspace</div>
          </div>
          <button className="log-detail-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="qh-toolbar">
          <div className="qh-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input placeholder="Search queries…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {/* Saved tab disabled — kept for future restoration
          <div className="qh-tabs">
            <button className={`qh-tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>All</button>
            <button className={`qh-tab${tab === 'saved' ? ' active' : ''}`} onClick={() => setTab('saved')}>Saved</button>
          </div>
          */}
        </div>
        <div className="qh-list">
          {items.length === 0 && (
            <div className="qh-empty">No queries match your search</div>
          )}
          {items.map(h => (
              <div key={h.id} className="qh-item" onClick={() => onApply(h.query)}>
                <div className="qh-item-top">
                  <code className="qh-item-query">{h.query}</code>
                  <span className="qh-item-time">{formatHistoryTime(h.time)}</span>
                </div>

                <div className="qh-item-meta">
                  <span className="qh-item-results">{h.results.toLocaleString()} results</span>
                  {h.actions.length > 0 && (
                    <span className="qh-item-actions">
                      {h.actions.map(a => <span key={a} className="qh-action-tag">{a}</span>)}
                    </span>
                  )}
                </div>
              </div>
          ))}
        </div>
      </aside>
    </div>
  )
}

function PatternsDrawer({ onClose }) {
  return (
    <div className="alert-drawer-overlay" onClick={onClose}>
      <aside className="alert-drawer" onClick={e => e.stopPropagation()}>
        <div className="alert-drawer-head">
          <div>
            <div className="alert-drawer-title">Top Patterns</div>
            <div className="alert-drawer-sub">Most frequently occurring log patterns</div>
          </div>
          <button className="log-detail-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="alert-drawer-body" style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          Pattern analysis will appear here
        </div>
      </aside>
    </div>
  )
}

function presetToMinutes(tr) {
  const map = {
    'Last 5 minutes': 5, 'Last 15 minutes': 15, 'Last 30 minutes': 30,
    'Last 1 hour': 60, 'Last 2 hours': 120, 'Last 3 hours': 180,
    'Last 6 hours': 360, 'Last 12 hours': 720, 'Last 24 hours': 1440,
    'Last 2 days': 2880, 'Last 3 days': 4320, 'Last 7 days': 10080,
  }
  if (tr === 'Today' || tr === 'Today so far') {
    const now = BASE_TIME
    const sod = new Date(now); sod.setHours(0, 0, 0, 0)
    return Math.round((now - sod) / 60000)
  }
  return map[tr] ?? null
}

const FILTERS_MIN_W = 232
const FILTERS_MAX_W = Math.round(FILTERS_MIN_W * 1.6)

// Fields shown in the Stream column — selecting one of these values offers the
// extra "Show distribution" action (mirrors CubeAPM's log selection menu).
const STREAM_DIST_FIELDS = new Set(['env', 'log.level', 'service'])
const DIST_BAR_COLOR = { error: '#EF4444', warn: '#F59E0B', info: '#60A5FA' }

function rowFieldValue(row, field) {
  if (field === 'log.level') return row.level
  if (field === 'service') return row.service
  if (field === '_msg' || field === 'message') return row.message
  return row.tags?.[field]
}

function computeDistribution(rows, field, k = 12) {
  const counts = {}
  let total = 0
  for (const r of rows) {
    const v = rowFieldValue(r, field)
    if (v == null || v === '') continue
    counts[String(v)] = (counts[String(v)] || 0) + 1
    total++
  }
  const items = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return { items: items.slice(0, k), total, distinct: items.length }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Wraps every occurrence of the searched terms in <mark> so a hit is findable
// without reading the whole line. Terms arrive longest-first so an overlapping
// short term can't chop a longer match in half.
function highlightTerms(text, terms) {
  if (!terms.length || !text) return text
  const rx = new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'ig')
  const parts = String(text).split(rx)
  // String.split with one capture group interleaves: text, match, text, match…
  return parts.map((p, i) => (i % 2 ? <mark key={i} className="log-hit">{p}</mark> : p))
}

function downloadCSV(rows) {
  const cols = ['time', 'level', 'service', 'message', 'k8s.namespace.name', 'k8s.pod.name', 'env']
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [
    cols.map(escape).join(','),
    ...rows.map(r => cols.map(c => {
      if (c === 'time') return escape(`${r.dateStr}T${r.timeStr}Z`)
      if (c === 'level') return escape(r.level)
      if (c === 'service') return escape(r.service)
      if (c === 'message') return escape(r.message)
      return escape(r.tags[c] ?? '')
    }).join(','))
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `logs-${Date.now()}.csv`; a.click()
  URL.revokeObjectURL(url)
}

function AlertDrawer({ filters, query, onClose }) {
  const activeFilters = Object.entries(filters).filter(([, s]) => s?.size)
  return (
    <div className="alert-drawer-overlay" onClick={onClose}>
      <aside className="alert-drawer" onClick={e => e.stopPropagation()}>
        <div className="alert-drawer-head">
          <div>
            <div className="alert-drawer-title">Create Alert</div>
            <div className="alert-drawer-sub">Alert fires when this query exceeds a threshold</div>
          </div>
          <button className="log-detail-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="alert-drawer-body">
          <div className="alert-field">
            <label className="alert-label">Query</label>
            <div className="alert-value mono">{query || <span style={{ color: 'var(--text-muted)' }}>All logs</span>}</div>
          </div>
          {activeFilters.length > 0 && (
            <div className="alert-field">
              <label className="alert-label">Active filters</label>
              <div className="alert-filters">
                {activeFilters.map(([k, s]) => (
                  <div key={k} className="alert-filter-row">
                    <span className="alert-filter-key">{k}</span>
                    <span className="alert-filter-vals">{[...s].join(', ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="alert-field">
            <label className="alert-label">Condition</label>
            <div className="alert-row">
              <select className="alert-select"><option>Count</option><option>Error rate</option></select>
              <select className="alert-select"><option>is above</option><option>is below</option></select>
              <input className="alert-input" type="number" defaultValue={100} />
            </div>
          </div>
          <div className="alert-field">
            <label className="alert-label">Evaluate every</label>
            <div className="alert-row">
              <select className="alert-select"><option>1 minute</option><option>5 minutes</option><option>15 minutes</option></select>
              <span className="alert-label" style={{ margin: 0 }}>for</span>
              <select className="alert-select"><option>1 minute</option><option>5 minutes</option></select>
            </div>
          </div>
          <div className="alert-field">
            <label className="alert-label">Alert name</label>
            <input className="alert-input wide" type="text" placeholder="e.g. High error rate on payment-service" />
          </div>
          <div className="alert-field">
            <label className="alert-label">Notify via</label>
            <select className="alert-select wide"><option>Email</option><option>Slack</option><option>PagerDuty</option><option>Webhook</option></select>
          </div>
        </div>
        <div className="alert-drawer-foot">
          <button className="alert-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="alert-btn-create" onClick={onClose}>Create Alert</button>
        </div>
      </aside>
    </div>
  )
}

export default function LogsView({ goHome, timeRange, setTimeRange }) {
  const [filters, setFilters] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [chips, setChips] = useState([])
  const [recents, setRecents] = useState([
    [{ field: 'service', op: 'eq', value: 'payment' }, { field: 'log.level', op: 'eq', value: 'error' }],
    [{ field: 'http.status', op: 'prefix', value: '5' }],
    [{ field: 'log.level', op: 'neq', value: 'info' }],
  ])
  const addRecent = useCallback((next) => {
    if (!next || next.length === 0) return
    const key = chipsToString(next)
    setRecents(prev => {
      const dedup = prev.filter(r => chipsToString(r) !== key)
      return [next, ...dedup].slice(0, 5)
    })
  }, [])
  const [live, setLive] = useState('off')
  const [pipes, setPipes] = useState([])         // populated by the pill toolbar
  // 'builder' = chip UI, 'raw' = hand-written CubeAPM syntax. The pill toolbar
  // stays live in both; in raw mode its edits rewrite the pipe section of the
  // raw text rather than feeding a separate preview.
  const [queryMode] = useState('builder')
  const [rawText, setRawText] = useState('')
  // True while the builder has an uncommitted, half-built filter chip. Drives the
  // Run button into a disabled (toned-down) state — you can't run a query that
  // still has an unfinished filter in it.
  const [builderComposing, setBuilderComposing] = useState(false)

  // In raw mode the text is the source of truth for filtering, so parse its
  // conditions head back into chips and surface any failure under the input.
  const rawParse = useMemo(() => {
    if (queryMode !== 'raw') return { ok: true, chips: [], error: null }
    const { conditions, pipes: pipeStages } = splitQuery(rawText)
    const parsed = tryParseConditions(conditions)
    if (!parsed.ok) return parsed
    const pipeErr = validatePipeText(pipeStages)
    return pipeErr ? { ok: false, chips: [], error: pipeErr } : parsed
  }, [queryMode, rawText])

  // Whichever mode is active supplies the chips that actually filter rows.
  // While raw text is mid-edit it spends most keystrokes in an unparseable
  // state; filtering on that would blow the result set away on every typo, so
  // the last good parse is held until a new one succeeds.
  const lastGoodChips = useRef([])
  if (queryMode === 'raw' && rawParse.ok) lastGoodChips.current = rawParse.chips
  const effectiveChips = queryMode === 'raw'
    ? (rawParse.ok ? rawParse.chips : lastGoodChips.current)
    : chips
  const aggPillRef = useRef(null)
  const [aggPopOpen, setAggPopOpen] = useState(false)
  const [editingFuncId, setEditingFuncId] = useState(null)   // null = create mode
  const groupByPillRef = useRef(null)
  const [groupByPopOpen, setGroupByPopOpen] = useState(false)
  const orderPillRef = useRef(null)
  const [orderPopOpen, setOrderPopOpen] = useState(false)
  const limitPillRef = useRef(null)
  const [limitPopOpen, setLimitPopOpen] = useState(false)
  const mathPillRef = useRef(null)
  const [mathPopOpen, setMathPopOpen] = useState(false)
  const [editingMathId, setEditingMathId] = useState(null)

  // All stats functions currently defined across pipes[] (v1 has at most one
  // stats pipe, but the model supports more so we flatten defensively).
  const statsFunctions = useMemo(
    () => pipes.filter(p => p.kind === 'stats').flatMap(p => p.functions || []),
    [pipes]
  )
  const editingFunc = editingFuncId ? statsFunctions.find(f => f.id === editingFuncId) : null

  const upsertAggregation = useCallback((fn) => {
    setPipes(prev => {
      const idx = prev.findIndex(p => p.kind === 'stats')
      if (idx === -1) {
        // First aggregation ever — create the stats pipe with this function.
        return [...prev, newStatsPipe({ functions: [fn] })]
      }
      const stats = prev[idx]
      const fnIdx = stats.functions.findIndex(f => f.id === fn.id)
      const nextFns = fnIdx === -1
        ? [...stats.functions, fn]                              // create
        : stats.functions.map(f => f.id === fn.id ? fn : f)     // edit
      const next = [...prev]
      next[idx] = { ...stats, functions: nextFns }
      return next
    })
  }, [])

  // Group-by fields live on the stats pipe. Read the current array (or []
   // if no stats pipe exists yet) and write updates through a single setter
   // that only mutates when a stats pipe is present.
  const groupBy = useMemo(() => {
    const stats = pipes.find(p => p.kind === 'stats')
    return stats?.groupBy || []
  }, [pipes])

  const setGroupBy = useCallback((next) => {
    setPipes(prev => {
      const idx = prev.findIndex(p => p.kind === 'stats')
      const current = idx === -1 ? [] : (prev[idx].groupBy || [])
      const nextArr = typeof next === 'function' ? next(current) : next
      if (idx === -1) {
        // No stats pipe yet — create an empty one holding the group-by so
        // users can pre-configure grouping before adding aggregations.
        if (nextArr.length === 0) return prev
        return [...prev, newStatsPipe({ groupBy: nextArr, functions: [] })]
      }
      const stats = prev[idx]
      // If both groupBy and functions become empty, drop the orphan pipe.
      if (nextArr.length === 0 && stats.functions.length === 0) {
        return prev.filter(p => p.id !== stats.id)
      }
      const next2 = [...prev]
      next2[idx] = { ...stats, groupBy: nextArr }
      return next2
    })
  }, [])

  const removeAggregation = useCallback((funcId) => {
    setPipes(prev => prev.flatMap(p => {
      if (p.kind !== 'stats') return [p]
      const nextFns = p.functions.filter(f => f.id !== funcId)
      // Keep the pipe if groupBy still has values (so the user's grouping
      // setup persists across "add/remove all aggregations" cycles).
      if (nextFns.length === 0 && (!p.groupBy || p.groupBy.length === 0)) return []
      return [{ ...p, functions: nextFns }]
    }))
  }, [])

  // Sort / limit / math pipes are singletons for sort+limit, multi for math.
   // These derived selectors + upserts keep LogsView state minimal (just
   // `pipes`) while the pill toolbar reads the current shape declaratively.
  const sortPipe = useMemo(() => pipes.find(p => p.kind === 'sort') || null, [pipes])
  const limitPipe = useMemo(() => pipes.find(p => p.kind === 'limit') || null, [pipes])
  const mathPipes = useMemo(() => pipes.filter(p => p.kind === 'math'), [pipes])
  const editingMath = editingMathId ? mathPipes.find(p => p.id === editingMathId) : null

  const removePipeById = useCallback((id) => {
    setPipes(prev => prev.filter(p => p.id !== id))
  }, [])

  // Field options for Order — you can only sort by things that appear in the
  // aggregation result: group-by columns and aliased stat outputs.
  const orderFieldOptions = useMemo(() => {
    const opts = []
    for (const f of groupBy) opts.push({ value: f, hint: 'group by' })
    for (const fn of statsFunctions) {
      if (fn.as) opts.push({ value: fn.as, hint: 'aggregation' })
    }
    return opts
  }, [groupBy, statsFunctions])

  // Names available inside a math expression = aliased stats + prior math.
  const mathAvailableNames = useMemo(() => {
    const idx = editingMath
      ? pipes.findIndex(p => p.id === editingMath.id)
      : pipes.length
    return namesInScopeBefore(pipes, idx === -1 ? pipes.length : idx)
  }, [pipes, editingMath])

  const openCreateMath = useCallback(() => {
    setEditingMathId(null)
    setMathPopOpen(true)
  }, [])
  const openEditMath = useCallback((id) => {
    setEditingMathId(id)
    setMathPopOpen(true)
  }, [])
  const closeMath = useCallback(() => {
    setMathPopOpen(false)
    setEditingMathId(null)
  }, [])
  const upsertMathPipe = useCallback((math) => {
    setPipes(prev => {
      const idx = prev.findIndex(p => p.id === math.id)
      if (idx === -1) return [...prev, { ...newMathPipe(), ...math }]
      const next = [...prev]
      next[idx] = { ...prev[idx], ...math }
      return next
    })
  }, [])

  const openCreateAggregation = useCallback(() => {
    setEditingFuncId(null)
    setAggPopOpen(true)
  }, [])
  const openEditAggregation = useCallback((funcId) => {
    setEditingFuncId(funcId)
    setAggPopOpen(true)
  }, [])
  const closeAggregation = useCallback(() => {
    setAggPopOpen(false)
    setEditingFuncId(null)
  }, [])
  const [activeFields, setActiveFields] = useState(DEFAULT_FIELDS)
  const [filtersWidth, setFiltersWidth] = useState(FILTERS_MIN_W)
  const [graphVisible, setGraphVisible] = useState(true)
  const [alertOpen, setAlertOpen] = useState(false)
  const [patternsOpen, setPatternsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  /* Saved-query state disabled — kept for future restoration
  const [historySaved, setHistorySaved] = useState(
    () => Object.fromEntries(QUERY_HISTORY.map(h => [h.id, h.saved]))
  )
  const toggleHistorySave = useCallback((id, name) => {
    setHistorySaved(prev => ({ ...prev, [id]: name }))
  }, [])
  */
  const [zoom, setZoom] = useState(null)
  const [dragBrush, setDragBrush] = useState(null)
  // Text-selection context menu: { x, y, text, field, value } | null
  const [selMenu, setSelMenu] = useState(null)
  // Distribution popover: { field, x, y } | null
  const [distField, setDistField] = useState(null)
  const dragRef = useRef(null)
  const brushStartRef = useRef(null)
  const prevTimeRangeRef = useRef(timeRange)

  // Detect a text selection inside the log table / detail panel and surface the menu.
  const handleLogSelection = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setSelMenu(null); return }
    const text = sel.toString().trim()
    if (!text) { setSelMenu(null); return }
    const range = sel.getRangeAt(0)
    const node = range.commonAncestorContainer
    const anchorEl = node.nodeType === 3 ? node.parentElement : node
    if (!anchorEl?.closest?.('[data-log-content]')) { setSelMenu(null); return }
    const fieldEl = anchorEl.closest('[data-log-field]')
    const rect = range.getBoundingClientRect()
    setDistField(null)
    setSelMenu({
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 232)),
      y: rect.bottom + 6,
      text,
      field: fieldEl ? fieldEl.getAttribute('data-log-field') : null,
      value: fieldEl ? (fieldEl.getAttribute('data-log-value') ?? text) : text,
    })
  }, [])

  const addChipToQuery = useCallback((chip) => {
    setChips(prev => prev.length === 0 ? [chip] : [...prev, { connector: 'AND', ...chip }])
  }, [setChips])

  const applySelectionChip = useCallback((mode) => {
    if (!selMenu) return
    const { field, value, text } = selMenu
    const chip = field
      ? { field, op: mode === 'include' ? 'eq' : 'neq', value }
      : mode === 'include'
        ? { field: '_msg', op: 'contains', value: text }
        : { field: '_msg', op: 'nregex', value: escapeRegex(text) }
    addChipToQuery(chip)
    window.getSelection()?.removeAllRanges()
    setSelMenu(null)
  }, [selMenu, addChipToQuery])

  const copySelection = useCallback(() => {
    if (!selMenu) return
    try { navigator.clipboard.writeText(selMenu.text) } catch (_) {}
    window.getSelection()?.removeAllRanges()
    setSelMenu(null)
  }, [selMenu])

  const openDistribution = useCallback(() => {
    if (!selMenu?.field) return
    setDistField({ field: selMenu.field, x: selMenu.x, y: selMenu.y })
    window.getSelection()?.removeAllRanges()
    setSelMenu(null)
  }, [selMenu])

  // Dismiss menu/popover on Escape, outside click, or scroll.
  useEffect(() => {
    if (!selMenu && !distField) return
    const onKey = (e) => { if (e.key === 'Escape') { setSelMenu(null); setDistField(null) } }
    const onDown = (e) => {
      if (e.target.closest?.('.log-sel-menu') || e.target.closest?.('.log-dist-pop')) return
      setSelMenu(null); setDistField(null)
    }
    const onScroll = () => { setSelMenu(null); setDistField(null) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [selMenu, distField])

  const clearZoom = useCallback(() => {
    if (zoom && prevTimeRangeRef.current) setTimeRange(prevTimeRangeRef.current)
    setZoom(null)
  }, [zoom, setTimeRange])

  const wrappedSetTimeRange = useCallback((v) => {
    if (!v?.startsWith?.('Custom')) prevTimeRangeRef.current = v
    setZoom(null)
    setTimeRange(v)
  }, [setTimeRange])

  useEffect(() => {
    if (!zoom) return
    const span = zoom.m1 - zoom.m2 + 1
    const spanLabel = span === 1 ? '1 min' : `${span} min`
    const fromLabel = zoom.m1 === 0 ? 'now' : `-${zoom.m1}m`
    const toLabel = zoom.m2 === 0 ? 'now' : `-${zoom.m2}m`
    setTimeRange(`Custom · ${fromLabel} → ${toLabel} (${spanLabel})`)
  }, [zoom, setTimeRange])

  useEffect(() => {
    const onUp = () => {
      if (!brushStartRef.current) return
      brushStartRef.current = null
      setDragBrush(prev => {
        if (prev && prev.s1 !== prev.s2) {
          const b1 = logVolume.find(d => d.label === prev.s1)
          const b2 = logVolume.find(d => d.label === prev.s2)
          if (b1 && b2) {
            setZoom({ m1: Math.max(b1.m, b2.m), m2: Math.min(b1.m, b2.m) })
          }
        }
        return null
      })
    }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [])

  const onChartMouseDown = (e) => {
    if (!e?.activeLabel) return
    brushStartRef.current = e.activeLabel
    setDragBrush({ s1: e.activeLabel, s2: e.activeLabel })
  }
  const onChartMouseMove = (e) => {
    if (!brushStartRef.current || !e?.activeLabel) return
    setDragBrush(prev => (prev && prev.s2 === e.activeLabel ? prev : { s1: brushStartRef.current, s2: e.activeLabel }))
  }

  const startResize = useCallback((e) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startW: filtersWidth }
    const onMove = (ev) => {
      const { startX, startW } = dragRef.current
      const next = Math.min(FILTERS_MAX_W, Math.max(FILTERS_MIN_W, startW + (ev.clientX - startX)))
      setFiltersWidth(next)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [filtersWidth])

  const toggleFilter = (group, value) => {
    setFilters(prev => {
      const next = { ...prev }
      const set = new Set(next[group] || [])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      next[group] = set
      return next
    })
  }

  const getSet = key => filters[key] || new Set()

  // Rows matching chips/query/facets but NOT the time window — used to build the volume histogram.
  const chipFilteredRows = useMemo(() => {
    const lvlSet = getSet('log.level')
    const svcSet = getSet('service')
    return logRows.filter(l => {
      if (query && !l.message.toLowerCase().includes(query.toLowerCase())) return false
      if (lvlSet.size && !lvlSet.has(l.level)) return false
      if (svcSet.size && !svcSet.has(l.service)) return false
      if (effectiveChips.length && !applyChipsToLog(l, effectiveChips)) return false
      return true
    })
  }, [filters, query, effectiveChips])

  // Literal strings the user is searching the message body for — the free-text
  // chips plus the facet search box. Regex chips are left out: their value is a
  // pattern, not the text that will appear in the line.
  const searchTerms = useMemo(() => {
    const terms = flattenLeaves(effectiveChips)
      .filter(c => c.field === '_msg' && c.op !== 'regex' && c.op !== 'nregex')
      .flatMap(c => (Array.isArray(c.value) ? c.value : [c.value]))
      .map(v => String(v ?? '').trim())
      .filter(Boolean)
    if (query.trim()) terms.push(query.trim())
    return [...new Set(terms)].sort((a, b) => b.length - a.length)
  }, [effectiveChips, query])

  // Pill edits in raw mode rewrite only the pipe section, leaving the
  // hand-written conditions head untouched. Writing the same string back is a
  // no-op for React, so this can't feed back into itself.
  useEffect(() => {
    if (queryMode !== 'raw') return
    setRawText(prev => replacePipeSection(prev, serializePipes(pipes)))
  }, [pipes, queryMode])

  // Grouping on its own is a complete question — "how many logs per service?" —
  // so an implied count() stands in until the user names a real aggregation.
  // Without it the aggregator has nothing to compute and returns empty, which
  // reads as "your grouping did nothing".
  const effectivePipes = useMemo(() => {
    const stats = pipes.find(p => p.kind === 'stats')
    if (!stats || stats.functions?.length || !stats.groupBy?.length) return pipes
    return pipes.map(p => (
      p.id === stats.id ? { ...p, functions: [{ ...newStatsFunction(), fn: 'count' }] } : p
    ))
  }, [pipes])

  // Run the client-side aggregator whenever chips or pipes change. Anchors
   // to BASE_TIME so the mock stream (which is deterministic from BASE_TIME
   // backward) always falls inside the window.
  const aggregateResult = useMemo(() => aggregate({
    pipes: effectivePipes,
    logs: chipFilteredRows,
    getFieldValue,
    now: BASE_TIME.getTime(),
    timeRange: 60 * 60 * 1000,
    bucketCount: 30,
  }), [effectivePipes, chipFilteredRows])

  // Scale logVolume (production-shaped baseline) by per-level filtered ratios.
  // When no filters are active the ratios are all 1 → original chart is preserved.
  // When filters are active each level's bar shrinks proportionally to how many
  // rows in that minute match the filter, keeping the production-like visual shape.
  const filteredVolume = useMemo(() => {
    // effectiveChips, not chips — in raw mode the active filter comes from the
    // parsed raw text and `chips` is empty, which would short-circuit to the
    // unfiltered baseline and desync the chart from the table.
    const hasFilters = effectiveChips.length > 0 || !!query || Object.values(filters).some(s => s?.size)
    if (!hasFilters) return logVolume

    const now = BASE_TIME.getTime()
    const allByMin = {}, filtByMin = {}
    const bucket = (acc, l) => {
      const m = Math.floor((now - l.time.getTime()) / 60000)
      if (m >= 0 && m < 60) {
        if (!acc[m]) acc[m] = { error: 0, warn: 0, info: 0 }
        acc[m][l.level]++
      }
    }
    logRows.forEach(l => bucket(allByMin, l))
    chipFilteredRows.forEach(l => bucket(filtByMin, l))

    return logVolume.map(d => {
      const all = allByMin[d.m]
      if (!all) return { ...d, info: 0, warn: 0, error: 0, total: 0 }
      const filt = filtByMin[d.m] || { error: 0, warn: 0, info: 0 }
      const info  = all.info  > 0 ? Math.round(d.info  * filt.info  / all.info)  : 0
      const warn  = all.warn  > 0 ? Math.round(d.warn  * filt.warn  / all.warn)  : 0
      const error = all.error > 0 ? Math.round(d.error * filt.error / all.error) : 0
      return { ...d, info, warn, error, total: info + warn + error }
    })
  }, [chipFilteredRows, filters, query, effectiveChips])

  const filtered = useMemo(() => {
    let rows = chipFilteredRows
    if (zoom) {
      const now = BASE_TIME.getTime()
      const tMin = now - (zoom.m1 + 1) * 60000
      const tMax = now - zoom.m2 * 60000
      rows = rows.filter(l => l.time.getTime() >= tMin && l.time.getTime() <= tMax)
    } else {
      const mins = presetToMinutes(timeRange)
      if (mins !== null) {
        const cutoff = BASE_TIME.getTime() - mins * 60000
        rows = rows.filter(l => l.time.getTime() >= cutoff)
      }
    }
    return rows
  }, [chipFilteredRows, zoom, timeRange])

  const visibleVolume = useMemo(() => {
    if (zoom) return filteredVolume.filter(d => d.m >= zoom.m2 && d.m <= zoom.m1)
    const mins = presetToMinutes(timeRange)
    if (mins !== null) return filteredVolume.filter(d => d.m <= mins)
    return filteredVolume
  }, [zoom, timeRange, filteredVolume])

  const visibleTotals = useMemo(() => ({
    total: visibleVolume.reduce((a, b) => a + b.total, 0),
    error: visibleVolume.reduce((a, b) => a + b.error, 0),
    warn: visibleVolume.reduce((a, b) => a + b.warn, 0),
    info: visibleVolume.reduce((a, b) => a + b.info, 0),
  }), [visibleVolume])

  const selected = selectedId ? filtered.find(l => l.id === selectedId) : null

  return (
    <>
      <PageBar timeRange={timeRange} setTimeRange={wrappedSetTimeRange}>
        <a onClick={goHome}>CubeAPM</a>
        <span className="sep">/</span>
        <span className="current">Logs</span>
      </PageBar>
      <div className="logs-layout logs-layout-stitched" style={{ gridTemplateColumns: `${filtersWidth}px 1fr` }} onMouseUp={handleLogSelection}>
      <div className="logs-filters">
        <div className="logs-filters-head">
          <span>Filters</span>
          {Object.values(filters).some(s => s?.size) && (
            <button className="logs-filters-clear" onClick={() => setFilters({})}>Clear all</button>
          )}
        </div>
        <FacetGroup title="log.level" options={logFacets['log.level']} selected={getSet('log.level')} onToggle={toggleFilter} toggleVariant="link" />
        <FacetGroup title="service" options={logFacets['service']} selected={getSet('service')} onToggle={toggleFilter} />
        <div
          className="logs-filters-resize"
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize filters panel"
        />
      </div>

      <div className="logs-main">
      <div className="logs-main-body">
        <div className="logs-query-bar">
          <QueryBuilder
            chips={chips}
            setChips={setChips}
            recents={recents}
            addRecent={addRecent}
            onRun={() => { /* results already reactive; kept as an explicit signal */ }}
            onComposingChange={setBuilderComposing}
          />
          <button className="hbtn small icon-only" title="Query history" aria-label="Query history" onClick={() => setHistoryOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
          </button>
          <button
            className="hbtn primary run-btn"
            title={queryMode === 'builder' && builderComposing ? 'Finish or remove the unfinished filter to run' : 'Run query'}
            aria-label="Run query"
            disabled={queryMode === 'builder' && builderComposing}
            onClick={() => addRecent(chips)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 01-4 4H4"/></svg>
            Run
          </button>
        </div>

        <div className="pipe-toolbar">
          <PipePill
            ref={groupByPillRef}
            icon={<Network />}
            label="Group by"
            active={groupByPopOpen}
            onAddClick={() => setGroupByPopOpen(o => !o)}
          >
            {groupBy.length > 0 && groupBy.map(field => (
              <PipePillChip
                key={field}
                title={`Grouping by ${field}`}
                onRemove={() => setGroupBy(prev => prev.filter(f => f !== field))}
              >
                {field}
              </PipePillChip>
            ))}
          </PipePill>
          <PipePill
            ref={aggPillRef}
            icon={<Sigma />}
            label="Aggregation"
            active={aggPopOpen}
            onAddClick={openCreateAggregation}
          >
            {statsFunctions.length > 0 && statsFunctions.map(fn => (
              <PipePillChip
                key={fn.id}
                title={fullFn(fn)}
                active={editingFuncId === fn.id && aggPopOpen}
                onClick={() => openEditAggregation(fn.id)}
                onRemove={() => removeAggregation(fn.id)}
              >
                {summarizeFn(fn)}
              </PipePillChip>
            ))}
          </PipePill>
          {/* Math sits next to Aggregation because its expressions operate on
              the aggregation's output names — Order and Limit act on the result
              set afterwards, so they read better downstream of it. */}
          <PipePill
            ref={mathPillRef}
            icon={<Calculator />}
            label="Math"
            active={mathPopOpen && !editingMathId}
            onAddClick={openCreateMath}
          >
            {mathPipes.length > 0 && mathPipes.map(mp => (
              <PipePillChip
                key={mp.id}
                title={mp.expression + (mp.as ? ` as ${mp.as}` : '')}
                active={editingMathId === mp.id && mathPopOpen}
                onClick={() => openEditMath(mp.id)}
                onRemove={() => removePipeById(mp.id)}
              >
                {mp.as || mp.expression || 'expr'}
              </PipePillChip>
            ))}
          </PipePill>
          <PipePill
            ref={orderPillRef}
            icon={<ArrowUpDown />}
            label="Order"
            active={orderPopOpen}
            addAffordance={sortPipe ? 'chevron' : 'plus'}
            onAddClick={() => setOrderPopOpen(o => !o)}
          >
            {sortPipe && (
              <PipePillChip
                title={`Sort by ${sortPipe.field || '…'} ${sortPipe.dir === 'asc' ? 'ascending' : 'descending'}`}
                onClick={() => setOrderPopOpen(true)}
                onRemove={() => removePipeById(sortPipe.id)}
              >
                {sortPipe.field || '…'} {sortPipe.dir === 'asc' ? '↑' : '↓'}
              </PipePillChip>
            )}
          </PipePill>
          <PipePill
            ref={limitPillRef}
            icon={<Hash />}
            label="Limit"
            active={limitPopOpen}
            addAffordance={limitPipe ? 'chevron' : 'plus'}
            onAddClick={() => setLimitPopOpen(o => !o)}
          >
            {limitPipe && (
              <PipePillChip
                title={`Return at most ${Number(limitPipe.n).toLocaleString()} rows`}
                onClick={() => setLimitPopOpen(true)}
                onRemove={() => removePipeById(limitPipe.id)}
              >
                {Number(limitPipe.n).toLocaleString()}
              </PipePillChip>
            )}
          </PipePill>
        </div>
        <AggregationPopover
          anchorRef={aggPillRef}
          open={aggPopOpen}
          onClose={closeAggregation}
          onSave={upsertAggregation}
          initial={editingFunc}
          allFields={AGG_ALL_FIELDS}
          numericFields={AGG_NUMERIC_FIELDS}
        />
        <GroupByPopover
          anchorRef={groupByPillRef}
          open={groupByPopOpen}
          onClose={() => setGroupByPopOpen(false)}
          fields={FIELD_CATALOG}
          selected={groupBy}
          onChange={setGroupBy}
        />
        <OrderPopover
          anchorRef={orderPillRef}
          open={orderPopOpen}
          onClose={() => setOrderPopOpen(false)}
          pipe={sortPipe}
          onChange={(patch) => setPipes(prev => {
            const idx = prev.findIndex(p => p.kind === 'sort')
            if (idx === -1) return [...prev, newSortPipe({ field: '', dir: 'desc', ...patch })]
            const next = [...prev]
            next[idx] = { ...next[idx], ...patch }
            return next
          })}
          onRemove={() => setPipes(prev => prev.filter(p => p.kind !== 'sort'))}
          fieldOptions={orderFieldOptions}
        />
        <LimitPopover
          anchorRef={limitPillRef}
          open={limitPopOpen}
          onClose={() => setLimitPopOpen(false)}
          pipe={limitPipe}
          onChange={(patch) => setPipes(prev => {
            const idx = prev.findIndex(p => p.kind === 'limit')
            if (idx === -1) return [...prev, newLimitPipe({ n: 100, ...patch })]
            const next = [...prev]
            next[idx] = { ...next[idx], ...patch }
            return next
          })}
          onRemove={() => setPipes(prev => prev.filter(p => p.kind !== 'limit'))}
        />
        <MathPopover
          anchorRef={mathPillRef}
          open={mathPopOpen}
          onClose={closeMath}
          onSave={upsertMathPipe}
          initial={editingMath}
          availableNames={mathAvailableNames}
        />

        <div className="logs-controls">
          <div className="logs-controls-left">
            <button className={`hbtn small${!graphVisible ? ' brand-lit' : ''}`} onClick={() => setGraphVisible(v => !v)} title={graphVisible ? 'Hide graph' : 'Show graph'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="13" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="18" y="3" width="4" height="18" rx="1"/></svg>
              {graphVisible ? 'Hide graph' : 'Show graph'}
            </button>
            <button className="hbtn small" onClick={() => setPatternsOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              Top Patterns
            </button>
            <FieldsDropdown activeFields={activeFields} setActiveFields={setActiveFields} />
            <div className="live-toggle">
            <button
              className={`live-btn${live === 'on' ? ' active' : live === 'pause' ? ' paused' : ''}`}
              onClick={() => setLive(live === 'off' ? 'on' : 'off')}
              title={live === 'off' ? 'Start live stream' : 'Stop live stream'}
            >
              <span className={`live-dot${live === 'on' ? ' on' : live === 'pause' ? ' paused' : ''}`} />
              {live === 'off' ? 'Live' : live === 'on' ? 'Live' : 'Paused'}
            </button>
            {live !== 'off' && (
              <button
                className="live-action-btn"
                onClick={() => setLive(live === 'on' ? 'pause' : 'on')}
                title={live === 'on' ? 'Pause live stream' : 'Resume live stream'}
              >
                {live === 'on' ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                )}
              </button>
            )}
          </div>
          </div>
          <div className="logs-controls-right">
          <button className="hbtn small" onClick={() => downloadCSV(filtered)} title="Download as CSV">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            CSV
          </button>
          <button className="hbtn small" onClick={() => setAlertOpen(true)} title="Create alert from this query">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 004 0"/><line x1="12" y1="2" x2="12" y2="4"/></svg>
            Alert
          </button>
          </div>
        </div>

        {statsFunctions.length === 0 && groupBy.length === 0 ? (<>
        {graphVisible && <div className="logs-volume">
          <div className="logs-volume-chart">
            {zoom && (
              <button className="volume-reset-btn" onClick={clearZoom} title="Clear time selection">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                Reset zoom
              </button>
            )}
            {!zoom && (
              <div className="volume-brush-hint">Click & drag on chart to zoom in</div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={visibleVolume}
                margin={{ top: 8, right: 6, left: 0, bottom: 0 }}
                onMouseDown={onChartMouseDown}
                onMouseMove={onChartMouseMove}
                style={{ cursor: brushStartRef.current ? 'ew-resize' : 'crosshair', userSelect: 'none' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border-subtle)' }} interval={Math.max(0, Math.floor(visibleVolume.length / 6))} minTickGap={20} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={34} />
                <Tooltip content={<VolumeTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} isAnimationActive={false} />
                <Bar dataKey="info" stackId="v" fill="#60A5FA" fillOpacity={0.55} isAnimationActive={false} />
                <Bar dataKey="warn" stackId="v" fill="#F59E0B" fillOpacity={0.75} isAnimationActive={false} />
                <Bar dataKey="error" stackId="v" fill="#EF4444" fillOpacity={0.85} isAnimationActive={false} />
                {dragBrush && dragBrush.s1 !== dragBrush.s2 && (
                  <ReferenceArea x1={dragBrush.s1} x2={dragBrush.s2} stroke="var(--brand)" strokeOpacity={0.6} fill="var(--brand)" fillOpacity={0.14} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="logs-volume-legend">
            <div className="lvl-row"><span className="lvl-key">Total</span><span className="lvl-val">{visibleTotals.total >= 1000 ? `${(visibleTotals.total / 1000).toFixed(2)}K` : visibleTotals.total.toLocaleString()}</span></div>
            <div className="lvl-row"><span className="lvl-swatch" style={{ background: '#EF4444' }} /><span className="lvl-key">error</span><span className="lvl-val val-critical">{visibleTotals.error}</span></div>
            <div className="lvl-row"><span className="lvl-swatch" style={{ background: '#F59E0B' }} /><span className="lvl-key">warn</span><span className="lvl-val val-warning">{visibleTotals.warn}</span></div>
            <div className="lvl-row"><span className="lvl-swatch" style={{ background: '#60A5FA' }} /><span className="lvl-key">info</span><span className="lvl-val">{visibleTotals.info.toLocaleString()}</span></div>
          </div>
        </div>}

        <div className="logs-stream-head">
          <div className="log-fixed-cols">
            <span className="lh-bar-spacer" />
            <span className="lh-time">Time</span>
          </div>
          <span className="lh-text">Text</span>
          <span className="lh-stream">Stream</span>
          {[...activeFields].map(f => (
            <span key={f} className="lh-extra">{f}</span>
          ))}
        </div>
        <div className="logs-stream-wrap">
          <div className="logs-stream" data-log-content>
            {filtered.length === 0 && (
              <div className="err-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                <div>No logs match this filter</div>
              </div>
            )}
            {filtered.map(l => (
              <div
                key={l.id}
                className={`log-row${selectedId === l.id ? ' selected' : ''}`}
                onClick={() => { if (window.getSelection()?.isCollapsed !== false) setSelectedId(l.id) }}
              >
                <div className="log-fixed-cols">
                  <span className={`log-lvl-bar log-lvl-${l.level}`} />
                  <span className="log-time">
                    <span className="log-date">{l.dateStr}</span>
                    <span className="log-hhmm">{l.timeStr}</span>
                  </span>
                </div>
                <span className="log-text">{highlightTerms(l.message, searchTerms)}</span>
                <span className="log-stream">
                  <span className="log-tag"><span className="k">env</span><span className="v" data-log-field="env" data-log-value={l.tags.env}>{l.tags.env}</span></span>
                  <span className="log-tag"><span className="k">log.level</span><span className="v" data-log-field="log.level" data-log-value={l.level}>{l.level}</span></span>
                  <span className="log-tag"><span className="k">service</span><span className="v" data-log-field="service" data-log-value={l.service}>{l.service}</span></span>
                </span>
                {[...activeFields].map(f => (
                  <span key={f} className="log-extra mono" data-log-field={f} data-log-value={l.tags[f] ?? l[f] ?? ''}>{l.tags[f] ?? l[f] ?? ''}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
        </>) : (
          <AggregateResults result={aggregateResult} graphVisible={graphVisible} />
        )}
      </div>

      {selected && (
        <aside className="log-detail">
          <div className="log-detail-head">
            <div>
              <div className="log-detail-title">Record</div>
              <div className="log-detail-sub mono">{selected.dateStr}T{selected.timeStr}Z</div>
            </div>
            <button className="log-detail-close" onClick={() => setSelectedId(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="log-detail-body" data-log-content>
            <div className="log-detail-msg">
              <div className="log-detail-key">_msg</div>
              <div className="log-detail-val mono">{highlightTerms(selected.message, searchTerms)}</div>
            </div>
            {Object.entries(selected.tags).map(([k, v]) => (
              <div key={k} className="log-detail-field">
                <span className="log-detail-key">{k}</span>
                <span className="log-detail-val mono" data-log-field={k} data-log-value={v}>{v}</span>
              </div>
            ))}
          </div>
        </aside>
      )}
      </div>
    </div>
    {alertOpen && <AlertDrawer filters={filters} query={query} onClose={() => setAlertOpen(false)} />}
    {patternsOpen && <PatternsDrawer onClose={() => setPatternsOpen(false)} />}
    {historyOpen && (
      <QueryHistoryDrawer
        onClose={() => setHistoryOpen(false)}
        onApply={(q) => { setQuery(q); setHistoryOpen(false) }}
      />
    )}

    {selMenu && (
      <div className="log-sel-menu" style={{ left: selMenu.x, top: selMenu.y }}>
        <button className="log-sel-item" onClick={() => applySelectionChip('include')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Include in Query
        </button>
        <button className="log-sel-item" onClick={() => applySelectionChip('exclude')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Exclude from Query
        </button>
        <button className="log-sel-item" onClick={copySelection}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Copy Text
        </button>
        {selMenu.field && STREAM_DIST_FIELDS.has(selMenu.field) && (
          <button className="log-sel-item" onClick={openDistribution}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Show distribution
          </button>
        )}
      </div>
    )}

    {distField && (() => {
      const dist = computeDistribution(filtered, distField.field)
      const width = 320
      const left = Math.max(8, Math.min(distField.x, window.innerWidth - width - 8))
      return (
        <div className="log-dist-pop" style={{ left, top: distField.y, width }}>
          <div className="log-dist-head">
            <div className="log-dist-title">Distribution · <span className="mono">{distField.field}</span></div>
            <button className="log-dist-close" onClick={() => setDistField(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="log-dist-sub">{dist.distinct} values · {dist.total.toLocaleString()} logs in view</div>
          <div className="log-dist-list">
            {dist.items.length === 0 && <div className="log-dist-empty">No values</div>}
            {dist.items.map(([val, count]) => {
              const pct = dist.total ? (count / dist.total) * 100 : 0
              const color = distField.field === 'log.level' ? (DIST_BAR_COLOR[val] || 'var(--brand)') : 'var(--brand)'
              return (
                <button
                  key={val}
                  className="log-dist-row"
                  onClick={() => { addChipToQuery({ field: distField.field, op: 'eq', value: val }); setDistField(null) }}
                  title={`Include ${distField.field} = ${val}`}
                >
                  <span className="log-dist-val mono" title={val}>{val}</span>
                  <span className="log-dist-bar-wrap"><span className="log-dist-bar" style={{ width: `${pct}%`, background: color }} /></span>
                  <span className="log-dist-count mono">{count.toLocaleString()}</span>
                  <span className="log-dist-pct mono">{pct.toFixed(1)}%</span>
                </button>
              )
            })}
          </div>
        </div>
      )
    })()}
    </>
  )
}

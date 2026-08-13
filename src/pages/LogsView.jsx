import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ResponsiveContainer } from 'recharts'
import { logRows, logVolume, logFacets, logTotals, BASE_TIME } from '@/data/observability'
import PageBar from '@/components/layout/PageBar'
import QueryBuilder, { applyChipsToLog, chipsToString } from '@/components/QueryBuilder'


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

function FacetGroup({ title, options, selected, onToggle }) {
  const [open, setOpen] = useState(true)
  const [q, setQ] = useState('')
  const filtered = q ? options.filter(o => o.value.toLowerCase().includes(q.toLowerCase())) : options
  const selectedCount = options.filter(o => selected.has(o.value)).length
  return (
    <div className="facet-group">
      <div className="facet-head" onClick={() => setOpen(o => !o)}>
        <div>
          <div className="facet-title">{title}</div>
          <div className="facet-meta">{options.length} total · <span className={selectedCount ? 'facet-meta-hi' : ''}>{selectedCount} selected</span></div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`facet-chev${open ? ' open' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
      </div>
      {open && (
        <>
          <div className="facet-search">
            <input placeholder="search…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="facet-list">
            {filtered.map(o => (
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
  const [activeFields, setActiveFields] = useState(DEFAULT_FIELDS)
  const [filtersWidth, setFiltersWidth] = useState(FILTERS_MIN_W)
  const [graphVisible, setGraphVisible] = useState(true)
  const [alertOpen, setAlertOpen] = useState(false)
  const [patternsOpen, setPatternsOpen] = useState(false)
  const [userSavedQueries, setUserSavedQueries] = useState([])
  const [savingName, setSavingName] = useState(null) // null = idle | string = editing name
  const [justSaved, setJustSaved] = useState(false)
  const saveCurrentQuery = useCallback((name) => {
    if (!name.trim() || chips.length === 0) return
    setUserSavedQueries(prev => [{ name: name.trim(), chips: [...chips] }, ...prev.filter(s => s.name !== name.trim())])
    setJustSaved(true)
    const timer = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [chips])
  const [zoom, setZoom] = useState(null)
  const [dragBrush, setDragBrush] = useState(null)
  const dragRef = useRef(null)
  const brushStartRef = useRef(null)
  const prevTimeRangeRef = useRef(timeRange)

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
      const startLabel = brushStartRef.current
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
      if (chips.length && !applyChipsToLog(l, chips)) return false
      return true
    })
  }, [filters, query, chips])

  // Scale logVolume (production-shaped baseline) by per-level filtered ratios.
  // When no filters are active the ratios are all 1 → original chart is preserved.
  // When filters are active each level's bar shrinks proportionally to how many
  // rows in that minute match the filter, keeping the production-like visual shape.
  const filteredVolume = useMemo(() => {
    const hasFilters = chips.length > 0 || !!query || Object.values(filters).some(s => s?.size)
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
  }, [chipFilteredRows, filters, query, chips])

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
      <div className="logs-layout logs-layout-stitched" style={{ gridTemplateColumns: `${filtersWidth}px 1fr` }}>
      <div className="logs-filters">
        <div className="logs-filters-head">
          <span>Filters</span>
          {Object.values(filters).some(s => s?.size) && (
            <button className="logs-filters-clear" onClick={() => setFilters({})}>Clear all</button>
          )}
        </div>
        <FacetGroup title="log.level" options={logFacets['log.level']} selected={getSet('log.level')} onToggle={toggleFilter} />
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
        <div className="logs-query-bar">
          <QueryBuilder
            chips={chips}
            setChips={setChips}
            recents={recents}
            addRecent={addRecent}
            savedQueries={userSavedQueries}
            onRun={() => { /* results already reactive; kept as an explicit signal */ }}
          />
          <button className="hbtn small icon-only" title="Query history" aria-label="Query history">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
          </button>
          <button
            className="hbtn small primary"
            title="Run query"
            aria-label="Run query"
            onClick={() => addRecent(chips)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 01-4 4H4"/></svg>
            Run
          </button>
        </div>

        {chips.length > 0 && (
          <div className="logs-query-preview">
            <span className="qb-preview-label">Query</span>
            <code className="qb-preview-code">{chipsToString(chips)}</code>
            <button
              type="button"
              className="qb-preview-copy"
              onClick={() => { try { navigator.clipboard.writeText(chipsToString(chips)) } catch (_) {} }}
              title="Copy query to clipboard"
              aria-label="Copy query"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
            {savingName === null ? (
              <button
                type="button"
                className={`qb-preview-save${justSaved ? ' saved' : ''}`}
                onClick={() => !justSaved && setSavingName('')}
                disabled={justSaved}
                title={justSaved ? 'Query saved!' : "Save this query for later — appears in the Saved Queries section of the search overlay"}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                {justSaved ? 'Saved' : 'Save query'}
              </button>
            ) : (
              <form
                className="qb-preview-save-form"
                onSubmit={(e) => { e.preventDefault(); if (savingName.trim()) { saveCurrentQuery(savingName); setSavingName(null) } }}
              >
                <input
                  autoFocus
                  className="qb-preview-save-input"
                  placeholder="Query name…"
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setSavingName(null) }}
                />
                <button type="submit" className="qb-preview-save-confirm" disabled={!savingName.trim()}>Save</button>
                <button type="button" className="qb-preview-save-cancel" onClick={() => setSavingName(null)} aria-label="Cancel">×</button>
              </form>
            )}
          </div>
        )}

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
          <button className="hbtn small" title="Explore — advanced query mode (coming soon)" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-2 6-6 2 2-6z"/></svg>
            Explore
          </button>
          </div>
        </div>

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
        <div className={`logs-stream-wrap${selected ? ' has-detail' : ''}`}>
          <div className="logs-stream">
            {filtered.length === 0 && (
              <div className="err-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                <div>No logs match this filter</div>
              </div>
            )}
            {filtered.map(l => (
              <div key={l.id} className={`log-row${selectedId === l.id ? ' selected' : ''}`} onClick={() => setSelectedId(l.id)}>
                <div className="log-fixed-cols">
                  <span className={`log-lvl-bar log-lvl-${l.level}`} />
                  <span className="log-time">
                    <span className="log-date">{l.dateStr}</span>
                    <span className="log-hhmm">{l.timeStr}</span>
                  </span>
                </div>
                <span className="log-text">{l.message}</span>
                <span className="log-stream">
                  <span className="log-tag"><span className="k">env</span><span className="v">{l.tags.env}</span></span>
                  <span className="log-tag"><span className="k">log.level</span><span className="v">{l.level}</span></span>
                  <span className="log-tag"><span className="k">service</span><span className="v">{l.service}</span></span>
                </span>
                {[...activeFields].map(f => (
                  <span key={f} className="log-extra mono">{l.tags[f] ?? l[f] ?? ''}</span>
                ))}
              </div>
            ))}
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
              <div className="log-detail-body">
                <div className="log-detail-msg">
                  <div className="log-detail-key">_msg</div>
                  <div className="log-detail-val mono">{selected.message}</div>
                </div>
                {Object.entries(selected.tags).map(([k, v]) => (
                  <div key={k} className="log-detail-field">
                    <span className="log-detail-key">{k}</span>
                    <span className="log-detail-val mono">{v}</span>
                  </div>
                ))}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
    {alertOpen && <AlertDrawer filters={filters} query={query} onClose={() => setAlertOpen(false)} />}
    {patternsOpen && <PatternsDrawer onClose={() => setPatternsOpen(false)} />}
    </>
  )
}

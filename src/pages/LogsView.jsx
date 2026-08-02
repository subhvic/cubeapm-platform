import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { logRows, logVolume, logFacets, logTotals } from '@/data/observability'


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

export default function LogsView({ goHome }) {
  const [filters, setFilters] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [live, setLive] = useState(false)
  const [showFields, setShowFields] = useState(false)

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

  const filtered = useMemo(() => {
    const lvlSet = getSet('log.level')
    const svcSet = getSet('service')
    const nsSet = getSet('k8s.namespace.name')
    return logRows.filter(l => {
      if (query && !l.message.toLowerCase().includes(query.toLowerCase())) return false
      if (lvlSet.size && !lvlSet.has(l.level)) return false
      if (svcSet.size && !svcSet.has(l.service)) return false
      if (nsSet.size && !nsSet.has(l.tags['k8s.namespace.name'])) return false
      return true
    })
  }, [filters, query])

  const selected = selectedId ? filtered.find(l => l.id === selectedId) : null

  return (
    <>
      <div className="card-crumbs">
        <a onClick={goHome}>CubeAPM</a>
        <span className="sep">/</span>
        <span className="current">Logs</span>
      </div>
      <div className="logs-layout">
      <div className="logs-filters">
        <div className="logs-filters-head">
          <span>Filters</span>
          {Object.values(filters).some(s => s?.size) && (
            <button className="logs-filters-clear" onClick={() => setFilters({})}>Clear all</button>
          )}
        </div>
        <FacetGroup title="log.level" options={logFacets['log.level']} selected={getSet('log.level')} onToggle={toggleFilter} />
        <FacetGroup title="service" options={logFacets['service']} selected={getSet('service')} onToggle={toggleFilter} />
        <FacetGroup title="k8s.namespace.name" options={logFacets['k8s.namespace.name']} selected={getSet('k8s.namespace.name')} onToggle={toggleFilter} />
        <FacetGroup title="k8s.deployment.name" options={logFacets['k8s.deployment.name']} selected={getSet('k8s.deployment.name')} onToggle={toggleFilter} />
      </div>

      <div className="logs-main">
        <div className="logs-query-bar">
          <div className="logs-query-input">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input placeholder="Filter log text - e.g. exception, timeout, 500" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <a className="logs-query-doc" href="#">See documentation for query examples →</a>
          <button className={`hbtn${live ? ' active' : ''}`} onClick={() => setLive(l => !l)} title="Live tail">
            <span className={`live-dot${live ? ' on' : ''}`} /> {live ? 'Live' : 'Off'}
          </button>
        </div>

        <div className="logs-volume">
          <div className="logs-volume-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={logVolume} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border-subtle)' }} interval={Math.floor(logVolume.length / 6)} minTickGap={20} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={34} />
                <Tooltip content={<VolumeTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                <Bar dataKey="info" stackId="v" fill="#60A5FA" fillOpacity={0.55} />
                <Bar dataKey="warn" stackId="v" fill="#F59E0B" fillOpacity={0.75} />
                <Bar dataKey="error" stackId="v" fill="#EF4444" fillOpacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="logs-volume-legend">
            <div className="lvl-row"><span className="lvl-key">Total</span><span className="lvl-val">{(logTotals.total / 1000).toFixed(2)}K</span></div>
            <div className="lvl-row"><span className="lvl-swatch" style={{ background: '#EF4444' }} /><span className="lvl-key">error</span><span className="lvl-val val-critical">{logTotals.error}</span></div>
            <div className="lvl-row"><span className="lvl-swatch" style={{ background: '#F59E0B' }} /><span className="lvl-key">warn</span><span className="lvl-val val-warning">{logTotals.warn}</span></div>
            <div className="lvl-row"><span className="lvl-swatch" style={{ background: '#60A5FA' }} /><span className="lvl-key">info</span><span className="lvl-val">{logTotals.info.toLocaleString()}</span></div>
          </div>
        </div>

        <div className={`logs-stream-wrap${selected ? ' has-detail' : ''}`}>
          <div className="logs-stream">
            <div className="logs-stream-head">
              <span className="lh-time">Time</span>
              <span className="lh-text">Text</span>
              <span className="lh-stream">Stream</span>
              <div className="logs-stream-tools">
                <button className={`hbtn small${showFields ? ' active' : ''}`} onClick={() => setShowFields(f => !f)}>Fields</button>
              </div>
            </div>
            {filtered.length === 0 && (
              <div className="err-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                <div>No logs match this filter</div>
              </div>
            )}
            {filtered.map(l => (
              <div key={l.id} className={`log-row${selectedId === l.id ? ' selected' : ''}`} onClick={() => setSelectedId(l.id)}>
                <span className={`log-lvl-bar log-lvl-${l.level}`} />
                <span className="log-time">
                  <span className="log-date">{l.dateStr}</span>
                  <span className="log-hhmm">{l.timeStr}</span>
                </span>
                <span className="log-text">{l.message}</span>
                <span className="log-stream">
                  <span className="log-tag"><span className="k">service</span><span className="v">{l.service}</span></span>
                  <span className="log-tag"><span className="k">ns</span><span className="v">{l.tags['k8s.namespace.name']}</span></span>
                </span>
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
    </>
  )
}

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ResponsiveContainer } from 'recharts'
import { logRows, logVolume, logFacets, BASE_TIME } from '@/data/observability'
import PageBar from '@/components/layout/PageBar'
import QueryBuilder, { applyChipsToLog, chipsToString, FIELD_CATALOG, getFieldValue, SAVED_QUERIES } from '@/components/QueryBuilder'
import { flattenLeaves, newGroup } from '@/utils/queryTree'
import { aggregate } from '@/utils/aggregator'
import AggregateResults from '@/components/AggregateResults'
import { serializePipes, composeQuery, parsePipes, newStatsPipe, newStatsFunction, newSortPipe, newLimitPipe, newMathPipe, namesInScopeBefore } from '@/utils/pipes'
import { tryParseConditions, splitQuery, replacePipeSection, validatePipeText } from '@/utils/rawQuery'
import PipePill, { PipePillChip } from '@/components/PipePill'
import StatusBadge from '@/components/shared/StatusBadge'
import { statusForLogLevel } from '@/utils/status'
import AggregationPopover from '@/components/AggregationPopover'
import GroupByPopover from '@/components/GroupByPopover'
import OrderPopover from '@/components/OrderPopover'
import LimitPopover from '@/components/LimitPopover'
import MathPopover from '@/components/MathPopover'
import PipePopover from '@/components/PipePopover'
import { Sigma, Network, ArrowUpDown, Hash, Calculator, AlertCircle, ArrowUpRight, Filter as FilterIcon, BookmarkPlus, BookmarkCheck, List, Star } from 'lucide-react'
import { services } from '@/data/services'
import {
  linkFor as resolveLink, highlightFields, fieldGroupsFor,
  recordType, recordTitle, TYPE_LABELS, durationGloss, conceptOf, ALIASES, isNoiseField,
} from '@/utils/logFields'

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

// The "N selected" count doubles as the control that narrows the list to those
// selections. One affordance for every facet: log.level used to carry a second,
// text-link version of the same action, which made the panel's first group the
// one place the interaction had to be learnt twice.
function FacetGroup({ title, options, selected, onToggle }) {
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
              {selectedCount === 0 ? (
                <span>{selectedCount} selected</span>
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

// Every tag a record carries can be turned into a column, so the Fields
// dropdown lists all of them rather than an arbitrary subset. Derived from the
// rows rather than written out: the list was a hand-kept copy, and it silently
// stopped covering the data the moment records of another shape arrived.
// Agent boilerplate is left out - it is on every row of its kind and identical
// every time, so it makes a column that says nothing.
const EXTRA_FIELDS = [...new Set(logRows.flatMap(r => Object.keys(r.tags)))]
  .filter(k => !isNoiseField(k))
  .sort()
  .map(key => ({ key, label: key }))

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
    { id: 1, query: 'service:payment AND log.level:error', time: new Date(now - 4 * 60000), results: 23, saved: 'Payment errors' },
    { id: 2, query: 'http.status:5* AND service:order', time: new Date(now - 18 * 60000), results: 87, saved: null },
    { id: 3, query: 'log.level:error', time: new Date(now - 42 * 60000), results: 119, saved: 'All errors' },
    { id: 4, query: '"Failed connecting to database"', time: new Date(now - 1.5 * 3600000), results: 34, saved: null },
    { id: 5, query: 'service:search AND log.level!=info', time: new Date(now - 2.1 * 3600000), results: 56, saved: null },
    { id: 6, query: 'endpoint:/v1/payment AND http.status:408', time: new Date(now - 3 * 3600000), results: 12, saved: 'Payment timeouts' },
    { id: 7, query: 'k8s.namespace.name:production AND log.level:warn', time: new Date(now - 5 * 3600000), results: 203, saved: null },
    { id: 8, query: 'trace_id:abc123*', time: new Date(now - 7 * 3600000), results: 8, saved: null },
    { id: 9, query: 'service:shipment AND "timeout"', time: new Date(now - 12 * 3600000), results: 41, saved: 'Shipment timeouts' },
    { id: 10, query: 'log.exception.type:NullPointerException', time: new Date(now - 18 * 3600000), results: 15, saved: null },
    { id: 11, query: 'path:/v1/order AND log.level:error', time: new Date(now - 24 * 3600000), results: 67, saved: null },
    { id: 12, query: 'service:payment AND "Transaction committed"', time: new Date(now - 36 * 3600000), results: 340, saved: null },
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

// Absolute, not "2h ago". The seeded history is anchored to the mock
// BASE_TIME, but a saved query is stamped with the real clock, so a relative
// figure would be measured against a clock that is not running.
function formatSavedAt(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// role="switch" rather than a styled checkbox: the control reports its own
// state to a screen reader, and the visible label sits beside it as the
// accessible name, so nothing here is an unlabelled shape.
function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`sq-toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="sq-toggle-knob" />
    </button>
  )
}

// Saving keeps the chips and pipes, not the string it renders to. Reapplying a
// saved query should put the builder back exactly as it was — a string would
// have to be reparsed, and anything the parser cannot express would come back
// as free text instead of the filters the user actually saved.
function SaveQueryPopover({
  anchorRef, open, onClose, onSave, onUpdate, preview, existingNames, timeRange,
  origin, previousQuery,
}) {
  // 'update' overwrites the query this one came from; 'new' keeps both. Offered
  // as tabs rather than a checkbox because they are two different outcomes, and
  // which one is wanted depends on whether the edit corrected the saved query
  // or branched off it — something only the user knows.
  const [tab, setTab] = useState('new')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [lockTime, setLockTime] = useState(false)
  const [defaultView, setDefaultView] = useState(false)
  const inputRef = useRef(null)

  const updating = tab === 'update' && !!origin

  // Opening picks the tab; changing tab reloads the fields under it. Update
  // starts from what the origin already says, so the common case — fixing the
  // query, keeping everything else — is no typing at all.
  useEffect(() => {
    if (!open) return
    setTab(origin ? 'update' : 'new')
  }, [open, origin])

  useEffect(() => {
    if (!open) return
    const from = tab === 'update' ? origin : null
    setName(from?.name ?? '')
    setDescription(from?.description ?? '')
    setLockTime(!!from?.timeRange)
    setDefaultView(!!from?.isDefault)
    // The field is the only thing in here; landing anywhere else costs a click.
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open, tab, origin])

  const trimmed = name.trim()
  // Its own name is not a clash with itself.
  const duplicate = existingNames.some(n =>
    n.toLowerCase() === trimmed.toLowerCase()
    && !(updating && n.toLowerCase() === (origin?.name ?? '').toLowerCase()))
  const submit = () => {
    if (!trimmed || duplicate) return
    if (updating) onUpdate(origin.id, trimmed, description.trim(), { lockTime, defaultView })
    else onSave(trimmed, description.trim(), { lockTime, defaultView })
    onClose()
  }

  return (
    <PipePopover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      title={updating ? 'Update query' : 'Save query'}
      subtitle={updating
        ? 'Replaces the saved filters and pipes with these'
        : 'Keeps the filters and pipes as they are now'}
      align="right"
      width={320}
    >
      <div className="agg-form">
        {origin && (
          <div className="sq-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'update'}
              className={`sq-tab${tab === 'update' ? ' is-active' : ''}`}
              onClick={() => setTab('update')}
            >
              Update Query
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'new'}
              className={`sq-tab${tab === 'new' ? ' is-active' : ''}`}
              onClick={() => setTab('new')}
            >
              Save as New
            </button>
          </div>
        )}
        <label className="agg-field">
          <span className="agg-lbl">Name</span>
          <input
            ref={inputRef}
            className="agg-input"
            value={name}
            placeholder="e.g. Checkout errors"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
            }}
          />
        </label>
        <label className="agg-field">
          <span className="agg-lbl">Description <span className="sq-optional">optional</span></span>
          <textarea
            className="agg-input sq-textarea"
            rows={2}
            value={description}
            placeholder="What is this for? When would you reach for it?"
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => {
              // Enter submits from the name field; here it should make a line.
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() }
            }}
          />
        </label>
        <div className="sq-section">
          <div className="sq-section-title">Time range</div>
          <div className="sq-row">
            <span className="sq-row-value">{timeRange}</span>
            <div className="sq-row-ctl">
              <Toggle checked={lockTime} onChange={setLockTime} label="Lock time" />
              <span className="sq-row-label">Lock time</span>
              <span
                className="sq-help"
                tabIndex={0}
                role="note"
                aria-label="Locked, the query reopens on this exact range. Unlocked, it uses whichever range is selected at the time."
                title="Locked, the query reopens on this exact range. Unlocked, it uses whichever range is selected at the time."
              >?</span>
            </div>
          </div>
        </div>

        <div className="sq-section">
          <div className="sq-row">
            <div className="sq-row-text">
              <div className="sq-section-title">Set as default view</div>
              <div className="sq-row-sub">Make this the default view</div>
            </div>
            <Toggle checked={defaultView} onChange={setDefaultView} label="Set as default view" />
          </div>
        </div>

        {updating && previousQuery && previousQuery !== preview ? (
          <div className="sq-preview">
            <span className="sq-preview-label">Replacing</span>
            <code className="sq-was">{previousQuery}</code>
            <span className="sq-preview-label">With</span>
            <code>{preview}</code>
          </div>
        ) : (
          <div className="sq-preview">
            <span className="sq-preview-label">Saving</span>
            <code>{preview}</code>
          </div>
        )}
        {duplicate && <div className="sq-warn">A query called “{trimmed}” already exists.</div>}
        <div className="agg-actions">
          <button type="button" className="agg-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="agg-btn is-primary" disabled={!trimmed || duplicate} onClick={submit}>
            {updating ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </PipePopover>
  )
}

// The seeded examples are listed alongside what the user has saved so the panel
// is never empty on a first visit, but only their own are removable — deleting
// a worked example out of a prototype leaves nothing to put back.
function MyQueriesDrawer({ onClose, saved, examples, onApply, onDelete }) {
  const [search, setSearch] = useState('')

  const match = (q) => !search
    || q.name.toLowerCase().includes(search.toLowerCase())
    || chipsToString(q.chips).toLowerCase().includes(search.toLowerCase())

  const mine = saved.filter(match)
  const shown = examples.filter(match)

  const Row = ({ q, onRemove }) => (
    <div className="qh-item" onClick={() => onApply(q)}>
      <div className="qh-item-top">
        <span className="sq-item-name">{q.name}</span>
        {onRemove && (
          <button
            className="sq-item-del"
            title={`Delete “${q.name}”`}
            aria-label={`Delete ${q.name}`}
            onClick={(e) => { e.stopPropagation(); onRemove(q.id) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>
      {q.description && <div className="sq-item-desc">{q.description}</div>}
      <div className="qh-item-meta">
        <code className="qh-item-query">{composeQuery(chipsToString(q.chips), withImpliedCount(q.pipes || []))}</code>
      </div>
      {(q.timeRange || q.isDefault || q.savedAt) && (
        <div className="sq-item-tags">
          {q.timeRange && <span className="sq-tag">{q.timeRange}</span>}
          {q.isDefault && <span className="sq-tag is-default">Default view</span>}
          {q.savedAt && <span className="sq-item-saved">Saved {formatSavedAt(q.savedAt)}</span>}
        </div>
      )}
    </div>
  )

  return (
    <div className="alert-drawer-overlay" onClick={onClose}>
      <aside className="alert-drawer qh-drawer" onClick={e => e.stopPropagation()}>
        <div className="alert-drawer-head">
          <div>
            <div className="alert-drawer-title">My Queries</div>
            <div className="alert-drawer-sub">Saved filters and pipes, ready to reapply</div>
          </div>
          <button className="log-detail-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="qh-toolbar">
          <div className="qh-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input placeholder="Search saved queries…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="qh-list">
          {mine.length === 0 && shown.length === 0 && (
            <div className="qh-empty">No saved queries match your search</div>
          )}
          {mine.length > 0 && <div className="sq-group">Saved by you</div>}
          {mine.map(q => <Row key={q.id} q={q} onRemove={onDelete} />)}
          {shown.length > 0 && <div className="sq-group">Examples</div>}
          {shown.map(q => <Row key={q.name} q={q} />)}
        </div>
      </aside>
    </div>
  )
}

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

// Grouping on its own is a complete question — "how many logs per service?" —
// so an implied count() stands in until the user names a real aggregation.
// Without it the aggregator has nothing to compute and returns empty, which
// reads as "your grouping did nothing".
//
// Dirty-checking runs both sides through this too: serializeStats drops a stats
// pipe that has no functions, so a group-by on its own would otherwise look
// byte-identical to no pipes at all and never light up the Run button.
function withImpliedCount(pipes) {
  const stats = pipes.find(p => p.kind === 'stats')
  if (!stats || stats.functions?.length || !stats.groupBy?.length) return pipes
  return pipes.map(p => (
    p.id === stats.id ? { ...p, functions: [{ ...newStatsFunction(), fn: 'count' }] } : p
  ))
}

// Separates "a malformed query worth explaining" from "a plain value that
// happens not to parse". Only the former earns an error on paste — pasting a
// service name or a URL into a value should just paste.
const LOOKS_LIKE_QUERY = /[:(]|!=|!~|\s(?:AND|OR|in|not_in)\s/i

// Leading facets in the order someone reaches for them — what happened, then
// who it happened to. Anything else the data turns up follows, alphabetically,
// so a new tag appears in the panel without being named here.
// Reads a facet's value off a row. `log.level` and `service` are properties of
// the row itself; every other facet is a tag. Mirrors how the facet lists are
// counted in observability.js, so a tick matches exactly the rows it counted.
function facetValueOf(row, field) {
  if (field === 'log.level') return row.level
  if (field === 'service') return row.service
  return row.tags?.[field]
}

const FACET_LEAD = ['log.level', 'service', 'http.status']

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

// Fields that lead somewhere else in the product. The destination is described
// here rather than at each render site, so the marker beside the value and the
// entry in the field menu can never name different places. Wiring navigation
// later means giving each entry an href — nothing about the signifier changes.
//
// Deliberately inert for now: a marker that reads as a live link and does
// nothing is worse than no marker at all.
// A log's service is not always an APM service: on a real instance log rows
// carry `search` while APM knows `search-service`. Linking anyway produces a
// page that loads, shows nothing, and blames the user, so the link resolver is
// told which names actually exist.
const KNOWN_SERVICES = new Set(services.map(s => s.id))

function linkFor(field, value, record) {
  return resolveLink({ field, value, record, knownServices: KNOWN_SERVICES })
}

// Marks a value as a doorway, and opens it when there is somewhere to go.
function LinkMarker({ link, onOpen }) {
  // Guarded because this is a decoration: if a caller ever stops passing a
  // link, the field should lose its marker, not blank the whole drawer.
  if (!link) return null
  const filter = link.kind === 'filter'
  const icon = filter
    ? <FilterIcon size={10} strokeWidth={2.25} />
    : <ArrowUpRight size={11} strokeWidth={2.25} />

  // An open link goes somewhere, so it is a button. A filter marker is not:
  // the filter itself is offered in the field menu, where include and exclude
  // already live, and a second way to press it would be two answers to one
  // question.
  if (filter || !onOpen) {
    return (
      <span className={`log-link-hint${filter ? ' is-filter' : ''}`}
        role="img" aria-label={link.hint} title={link.hint}>{icon}</span>
    )
  }
  return (
    <button type="button" className="log-link-hint is-open"
      aria-label={link.label} title={link.hint}
      onClick={(e) => { e.stopPropagation(); onOpen(link) }}>{icon}</button>
  )
}

// These exist only on error records. Elsewhere the rows are labels for things
// that are not there, which reads as missing data rather than as "this log did
// not throw" - and since they are a whole group, an info record would otherwise
// end with a heading-shaped gap. With both empty the group drops out entirely.
//
// The JSON view deliberately keeps them: that view is the raw record, this one
// is what the record actually has.
const ERROR_ONLY_FIELDS = new Set(['log.exception.type', 'log.stacktrace'])

function isHiddenField(k, v) {
  return ERROR_ONLY_FIELDS.has(k) && (v == null || v === '')
}

// What the record is about leads, and what it is stamped with follows. Which
// fields those are depends on the shape of the record: a database call opens on
// the statement, a cluster event on what happened to what.
function recordFieldGroups(log) {
  return fieldGroupsFor(log, { isHidden: isHiddenField })
}

// The SDK's resource block and the Kubernetes API's managedFields are on every
// record of their kind, identical every time. Sorted alphabetically they are
// the first screen of the record, which is how a drawer opens on a wall of
// things nobody came to read. They are still part of the record, so they stay -
// folded, counted, and one click away.
function NoiseGroup({ fields, hits, record, canPin, onTogglePin, onMenu, onOpenLink }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="log-detail-group is-noise">
      <button type="button" className="log-noise-toggle"
        aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={open ? 'is-open' : undefined}><path d="M9 18l6-6-6-6" /></svg>
        {fields.length} agent and platform {fields.length === 1 ? 'field' : 'fields'}
      </button>
      {open && fields.map(([k, v]) => (
        <FieldRow
          key={k} name={k} value={v} hits={hits} record={record}
          pinned={false} pinnable={canPin(k)}
          onTogglePin={onTogglePin} onMenu={onMenu} onOpenLink={onOpenLink}
        />
      ))}
    </div>
  )
}

// One field row, shared by the pinned block and the grouped list so a field
// looks and behaves the same wherever it currently sits.
function FieldRow({ name, value, hits, record, isMsg, pinned, pinnable, onTogglePin, onMenu, onOpenLink }) {
  const link = isMsg ? null : linkFor(name, value, record)
  // Any of the four spellings a stack trace arrives under. Matching one name
  // meant an Elastic agent's error.stack_trace rendered as a wrapped paragraph
  // with its frames run together - the exact thing this view exists to fix.
  const isStack = conceptOf(name) === 'stacktrace' && !!value
  const gloss = isMsg ? null : durationGloss(name, value)
  const block = isStack || isMsg
  return (
    <div className={`log-detail-field${block ? ' is-block' : ''}`}>
      <span className="log-detail-key">{highlightTerms(name, hits)}</span>
      {isStack ? (
        <StackTrace text={String(value)} />
      ) : isMsg ? (
        <div className="log-detail-val is-msg mono">{highlightTerms(String(value ?? ''), hits)}</div>
      ) : (
        <span className={`log-detail-val mono${link ? ' is-link' : ''}`} data-log-field={name} data-log-value={value}>
          {highlightTerms(String(value ?? ''), hits)}
          {gloss && <span className="log-detail-gloss">{gloss}</span>}
          {link && <LinkMarker link={link} onOpen={onOpenLink} />}
        </span>
      )}
      <div className="log-field-actions">
        <button
          type="button"
          className="log-field-menu-btn"
          aria-label={`Actions for ${name}`}
          title={`Actions for ${name}`}
          onClick={(e) => { e.stopPropagation(); onMenu(name, value, e.currentTarget) }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
        </button>
        {pinnable && <PinButton name={name} pinned={pinned} onToggle={onTogglePin} />}
      </div>
    </div>
  )
}

// Pinning is what someone does when they are reading the same field across many
// records, so the button stays visible once set rather than hiding with the row.
function PinButton({ name, pinned, onToggle }) {
  return (
    <button
      type="button"
      className={`log-field-pin-btn${pinned ? ' is-pinned' : ''}`}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${name}` : `Pin ${name} to the top`}
      title={pinned ? `Unpin ${name}` : `Pin ${name} to the top`}
      onClick={(e) => { e.stopPropagation(); onToggle(name) }}
    >
      <svg viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 17v5"/><path d="M9 10.76V4h6v6.76l2 2.24v2H7v-2z"/>
      </svg>
    </button>
  )
}

// What the message row is called in the Overview. The record's own field is
// still _msg — that is what the JSON view shows and what a chip filters on —
// but "text" is what the column is called in the table this drawer opens from.
const MSG_LABEL = 'text'

// The message is fixed at the top like the identity cards, so it takes a copy
// button rather than the field menu, and cannot be pinned — it is already there.
//
// Clamping is done in CSS rather than by counting newlines, so a single long
// line that wraps past two rows collapses the same way a multi-line one does.
function MessageCard({ text, hits, onCopy }) {
  const [expanded, setExpanded] = useState(true)
  const [clamped, setClamped] = useState(false)
  const valRef = useRef(null)

  useEffect(() => { setExpanded(true) }, [text])

  // Measured by line count rather than by comparing scrollHeight to clientHeight:
  // the box is only shorter than its content while collapsed, so a height
  // comparison would report nothing to collapse whenever it is already open.
  // scrollHeight carries the full content in either state.
  useEffect(() => {
    const el = valRef.current
    if (!el) return
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 1
    setClamped(Math.round(el.scrollHeight / lineHeight) > 2)
  }, [text])

  return (
    <div className="log-detail-field is-block">
      <span className="log-detail-key">{highlightTerms(MSG_LABEL, hits)}</span>
      <div
        ref={valRef}
        className={`log-detail-val is-msg mono log-msg-text${expanded ? ' is-expanded' : ''}`}
      >{highlightTerms(String(text ?? ''), hits)}</div>
      <div className="log-field-actions">
        <button
          type="button"
          className="log-field-menu-btn"
          aria-label="Copy message"
          title="Copy message"
          onClick={(e) => { e.stopPropagation(); onCopy(String(text ?? ''), 'Message copied to clipboard') }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
        {clamped && (
          <button
            type="button"
            className="log-msg-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded(v => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={expanded ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
            </svg>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </div>
  )
}

// Collapsed height. Two frames is enough to see where the throw happened
// without a trace taking over the panel.
const COLLAPSED_FRAMES = 2

// Returns two grid children rather than one box: the exception message belongs
// on the label's line, where every other field puts its value, and only the
// frames need the full width beneath.
function StackTrace({ text }) {
  const [expanded, setExpanded] = useState(false)
  const [head, ...frames] = String(text).split('\n')
  const collapsible = frames.length > COLLAPSED_FRAMES
  const shown = expanded || !collapsible ? frames : frames.slice(0, COLLAPSED_FRAMES)
  const hidden = frames.length - shown.length

  return (
    <>
      <div className="log-stack-msg">{head}</div>
      {frames.length > 0 && (
        <div className="log-stack-frames">
          {/* The scroll lives on the inner list so the toggle stays put rather
              than scrolling away with the frames it controls. */}
          <div className={`log-stack-scroll${expanded ? ' is-expanded' : ''}`}>
            {shown.map((line, i) => <div className="log-stack-frame" key={i}>{line}</div>)}
          </div>
          {collapsible && (
            <button
              type="button"
              className="log-stack-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded(v => !v)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={expanded ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
              </svg>
              {expanded ? 'Show less' : `${hidden} more frame${hidden === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}
    </>
  )
}

// How old the record is, in days, read the way people say it. Compared by
// calendar day rather than elapsed hours: a log from 23:55 seen at 00:05 is
// "yesterday", not "today", even though only ten minutes have passed.
function relativeDayLabel(date, now = new Date()) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

// The record as one object — what the JSON view renders and Copy JSON writes.
// Mirrors what the Fields view lists: timestamp and message alongside the tags.
//
// Undefined values are normalised to empty strings. A tag can be undefined when
// the source has no value for it, and JSON.stringify drops those keys entirely —
// so without this, Copy JSON would quietly hand over a record missing fields the
// Fields view had just listed.
function toRecord(log) {
  const out = {
    _time: `${log.dateStr}T${log.timeStr}Z`,
    _msg: log.message,
  }
  for (const [k, v] of Object.entries(log.tags)) out[k] = v ?? ''
  return out
}

// One JSON line. Recurses on objects so a nested payload renders correctly if
// the data ever grows one — today every record is flat.
// Flattens the record into the lines a JSON document would have, so each one
// can carry a number. Recursing here rather than in the renderer keeps line
// numbering a simple index — a nested object spans several lines, and a
// component that returns a fragment cannot number its own output.
function jsonLines(data) {
  const out = [{ kind: 'open', depth: 0 }]
  const walk = (obj, depth, prefix) => {
    const entries = Object.entries(obj)
    entries.forEach(([name, value], i) => {
      const path = prefix ? `${prefix}.${name}` : name
      const comma = i < entries.length - 1
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        out.push({ kind: 'open', depth, name, path, value })
        walk(value, depth + 1, path)
        out.push({ kind: 'close', depth, comma })
      } else {
        out.push({ kind: 'pair', depth, name, path, value, comma })
      }
    })
  }
  walk(data, 1, '')
  out.push({ kind: 'close', depth: 0 })
  return out
}

function JsonLine({ line, number, record, onKeyMenu, onOpenLink }) {
  const { kind, depth, name, path, value, comma } = line
  const keyBtn = name != null && (
    <button
      type="button"
      className="log-json-key"
      onClick={(e) => { e.stopPropagation(); onKeyMenu(path, value, e.currentTarget) }}
      title={`Actions for ${path}`}
    >"{name}"</button>
  )
  const isNum = typeof value === 'number'
  const link = kind === 'pair' ? linkFor(name, value, record) : null

  return (
    <div className="log-json-line">
      <span className="log-json-ln" aria-hidden="true">{number}</span>
      {/* Indented in `ch` so the step lands on the monospace grid, the way an
          editor would show it, rather than on an arbitrary pixel value. */}
      <span className="log-json-code" style={{ paddingLeft: `${depth * 2}ch` }}>
        {kind === 'open' && (
          name == null
            ? <span className="log-json-punc">{'{'}</span>
            : <>{keyBtn}<span className="log-json-punc">: {'{'}</span></>
        )}
        {kind === 'close' && <span className="log-json-punc">{'}'}{comma ? ',' : ''}</span>}
        {kind === 'pair' && (
          <>
            {keyBtn}
            <span className="log-json-punc">: </span>
            <span className={`log-json-val${isNum ? ' num' : ''}`}>
              {isNum ? String(value) : JSON.stringify(value ?? '')}
            </span>
            <span className="log-json-punc">{comma ? ',' : ''}</span>
            {link && <LinkMarker link={link} onOpen={onOpenLink} />}
          </>
        )}
      </span>
    </div>
  )
}

// Every action here already existed somewhere — Include/Exclude in the
// text-selection menu, columns in the Fields dropdown, grouping in the pipe
// toolbar. What was missing was reaching any of them from the field you are
// looking at, instead of memorising its name and retyping it in the bar.
export function LogRecordDrawer({
  record, onClose, searchTerms,
  onAddChip, onDistribution, onCopy,
  index = 0, total = 0, onNavigate,
  pinned = [], onTogglePin, onOpenLink,
  initialView = 'fields',
}) {
  const [view, setView] = useState(initialView)
  const [menu, setMenu] = useState(null)   // { field, value, x, y }
  const [fieldQuery, setFieldQuery] = useState('')
  // Navigation runs on time, not position: logs are ordered newest-first and
  // paginated, so a total is only ever "what has loaded" and an ordinal would
  // describe that window rather than the result set. Newest is always knowable —
  // it is the top of the list — while oldest is not, so the jump anchor has no
  // counterpart.
  //
  // Once the backend paginates, Older at the loaded edge should fetch the next
  // page rather than disable; the in-flight and stale states for that already
  // exist on the query path.
  const hasNewer = index > 0
  const hasOlder = index >= 0 && index < total - 1

  // Matches a field on either half of the pair. Someone looking for "payment"
  // is as likely to be hunting the value as the field holding it, and which one
  // it turns out to be is exactly what they are trying to find out.
  const q = fieldQuery.trim().toLowerCase()
  const hits = q ? [fieldQuery.trim()] : []
  const matches = (k, v) =>
    !q || k.toLowerCase().includes(q) || String(v ?? '').toLowerCase().includes(q)

  const groups = useMemo(() => recordFieldGroups(record)
    .map(g => ({ ...g, fields: g.fields.filter(([k, v]) => !pinned.includes(k) && matches(k, v)) }))
    .filter(g => g.fields.length > 0),
  [record, q, pinned])   // eslint-disable-line react-hooks/exhaustive-deps

  const shape = recordType(record)
  const title = recordTitle(record)

  const valueOf = (k) => (k === '_msg' ? record.message : record.tags[k])
  // The stack trace and its exception type are the two fields that cannot be
  // pinned: one is a block, and neither exists on most records, so pinning them
  // would leave a gap at the top of every non-error log.
  // Every list field can be pinned. The message cannot: it already has a fixed
  // place of its own above, so pinning it would only move it a few pixels.
  const canPin = (k) => k !== '_msg'

  // Pin order is insertion order, so the newest pin lands at the bottom of the
  // block and the ones above it never move.
  // isHiddenField applies here too: a pinned stack trace is still absent from a
  // record that did not throw, and should leave no empty row behind when it is.
  // The pin itself survives — it reappears on the next error record.
  const pinnedRows = pinned
    .filter(k => canPin(k) && k in record.tags
      && !isHiddenField(k, valueOf(k)) && matches(k, valueOf(k)))
    .map(k => [k, valueOf(k)])

  // Which fields lead depends on the shape of the record, and each is resolved
  // through the alias table, so a New Relic service.name occupies the same card
  // an OTel service would.
  const highlights = highlightFields(record).filter(([k, v]) => matches(k, v))

  const msgMatches = !!title.detail && (matches(MSG_LABEL, title.detail) || matches('_msg', title.detail))
  const matchCount = groups.reduce((n, g) => n + g.fields.length, 0)
    + pinnedRows.length + highlights.length + (msgMatches ? 1 : 0)

  const json = useMemo(() => toRecord(record), [record])

  // A menu belongs to the row it was opened from; switching record or view
  // leaves it pointing at something no longer on screen.
  useEffect(() => { setMenu(null) }, [record, view])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])

  const openMenu = (field, value, anchor) => {
    const r = anchor.getBoundingClientRect()
    setMenu({ field, value: value == null ? '' : String(value), x: r.right, y: r.bottom + 4 })
  }

  const run = (fn) => { fn(); setMenu(null) }

  return (
    <aside className="log-detail">
      <div className="log-detail-head">
        <div className="log-detail-heading">
          <div className="log-detail-title-row">
            <StatusBadge
              status={statusForLogLevel(record.level)}
              label={record.level.charAt(0).toUpperCase() + record.level.slice(1)}
            />
            {/* A Kubernetes event stores the literal "UNSET" where a message
                would go, so the shape and the built title are the only things
                that say what you are looking at. */}
            <span className="log-detail-shape">{TYPE_LABELS[shape]}</span>
            {title.title && <span className="log-detail-built-title">{title.title}</span>}
          </div>
          <div className="log-detail-sub mono">
            {record.dateStr}T{record.timeStr}Z
            <span className="log-detail-age">({relativeDayLabel(record.time)})</span>
          </div>
        </div>
        <div className="log-detail-head-right">
          {total > 1 && (
            <nav className="log-detail-nav" aria-label="Record navigation">
              <button
                className="icon-only"
                onClick={() => onNavigate(0)}
                disabled={!hasNewer}
                title="Jump to newest record"
                aria-label="Jump to newest record"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14"/><path d="M12 21V9"/><path d="M6 15l6-6 6 6"/></svg>
              </button>
              <button onClick={() => onNavigate(index - 1)} disabled={!hasNewer} title="Newer record">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                Newer
              </button>
              <button onClick={() => onNavigate(index + 1)} disabled={!hasOlder} title="Older record">
                Older
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </nav>
          )}
          <button className="log-detail-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <div className="log-detail-tabs" role="tablist">
        <button role="tab" aria-selected={view === 'fields'}
          className={`log-detail-tab${view === 'fields' ? ' active' : ''}`}
          onClick={() => setView('fields')}>Overview</button>
        <button role="tab" aria-selected={view === 'json'}
          className={`log-detail-tab${view === 'json' ? ' active' : ''}`}
          onClick={() => setView('json')}>JSON</button>
        {view === 'json' && (
          <button className="log-detail-copyjson"
            onClick={() => onCopy(JSON.stringify(json, null, 2), 'Record copied to clipboard as JSON')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy JSON
          </button>
        )}
      </div>

        {view === 'fields' && highlights.length > 0 && (
          <div
            className="log-detail-highlights"
            style={{ gridTemplateColumns: `repeat(${highlights.length}, minmax(0, 1fr))` }}
          >
            {highlights.map(([k, v]) => {
              const link = linkFor(k, v, record)
              return (
                <div className="log-hl-card" key={k}>
                  <div className="log-hl-head">
                    <span className="log-hl-key">{highlightTerms(k, hits)}</span>
                    <button
                        type="button"
                        className="log-field-menu-btn"
                        aria-label={`Actions for ${k}`}
                        title={`Actions for ${k}`}
                        onClick={(e) => { e.stopPropagation(); openMenu(k, v, e.currentTarget) }}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
                      </button>
                  </div>
                  <div className="log-hl-value-row">
                    {v == null || v === '' ? (
                      <span className="log-hl-value is-empty" aria-label="No value">—</span>
                    ) : (
                      <>
                        <span
                          className={`log-hl-value mono${link ? ' is-link' : ''}`}
                          title={String(v)}
                          data-log-field={k}
                          data-log-value={v}
                        >{highlightTerms(String(v), hits)}</span>
                        {durationGloss(k, v) && (
                          <span className="log-detail-gloss">{durationGloss(k, v)}</span>
                        )}
                        {link && <LinkMarker link={link} onOpen={onOpenLink} />}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {/* Overview only. Filtering the JSON view would hand back something that
          reads as the record but no longer parses as one. */}
      {view === 'fields' && (
        <div className="log-detail-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input
            value={fieldQuery}
            onChange={(e) => setFieldQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && fieldQuery) { e.stopPropagation(); setFieldQuery('') } }}
            placeholder="Search fields and values…"
            spellCheck={false}
            autoComplete="off"
            aria-label="Search fields and values"
          />
          {fieldQuery && (
            <button type="button" onClick={() => setFieldQuery('')} aria-label="Clear search" title="Clear search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>
      )}

      {view === 'fields' ? (
        <div className="log-detail-body" data-log-content>
          {matchCount === 0 && (
            <div className="log-detail-nomatch">
              No field or value matches <span className="mono">{fieldQuery.trim()}</span>
            </div>
          )}
          {msgMatches && (
            <div className="log-detail-group is-msg-card">
              <MessageCard
                text={title.detail}
                hits={q ? hits : searchTerms}
                onCopy={onCopy}
              />
            </div>
          )}

          {pinnedRows.length > 0 && (
            <div className="log-detail-pinned">
              {pinnedRows.map(([k, v]) => (
                <FieldRow
                  key={k} name={k} value={v} hits={hits} record={record}
                  isMsg={k === '_msg'}
                  pinned pinnable
                  onTogglePin={onTogglePin} onMenu={openMenu} onOpenLink={onOpenLink}
                />
              ))}
            </div>
          )}
          {groups.map((group, gi) => (
            group.noise
              ? <NoiseGroup key={gi} fields={group.fields} hits={hits} record={record}
                  canPin={canPin} onTogglePin={onTogglePin} onMenu={openMenu} onOpenLink={onOpenLink} />
              : (
                <div className="log-detail-group" key={gi}>
                  {group.fields.map(([k, v]) => (
                    <FieldRow
                      key={k} name={k} value={v} hits={hits} record={record}
                      pinned={false} pinnable={canPin(k)}
                      onTogglePin={onTogglePin} onMenu={openMenu} onOpenLink={onOpenLink}
                    />
                  ))}
                </div>
              )
          ))}
        </div>
      ) : (
        <div className="log-detail-body log-json-body">
          <div className="log-json">
            {jsonLines(json).map((line, i) => (
              <JsonLine key={i} line={line} number={i + 1} record={record} onKeyMenu={openMenu} onOpenLink={onOpenLink} />
            ))}
          </div>
        </div>
      )}

      {menu && (() => {
        const isMsg = menu.field === '_msg' || menu.field === '_time'
        const hasValue = menu.value !== ''
        const width = 208
        const left = Math.max(8, Math.min(menu.x - width, window.innerWidth - width - 8))
        const top = Math.min(menu.y, window.innerHeight - 300)
        return (
          <div className="log-sel-menu log-field-menu" style={{ left, top, width }}
            onMouseDown={(e) => e.stopPropagation()}>
            {/* Names the destination in words, so the marker beside the value
                does not have to be decoded from an arrow alone. Rendered as a
                div rather than a button: nothing happens on press yet, and it
                should not take focus pretending otherwise. */}
            {(() => {
              const link = linkFor(menu.field, menu.value, record)
              if (!link) return null
              // A filter link is something we can actually do today, so it is a
              // button. An open link is not wired to a destination yet, and a
              // control that swallows the press teaches people it is broken.
              return (
                <>
                  {link.kind === 'filter' ? (
                    <button className="log-sel-item" title={link.hint}
                      onClick={() => run(() => onAddChip({ field: link.field, op: 'eq', value: link.value }))}>
                      <FilterIcon size={14} strokeWidth={2} />
                      {link.label}
                    </button>
                  ) : onOpenLink ? (
                    <button className="log-sel-item" title={link.hint}
                      onClick={() => run(() => onOpenLink(link))}>
                      <ArrowUpRight size={14} strokeWidth={2} />
                      {link.label}
                    </button>
                  ) : (
                    <div className="log-sel-item is-pending" aria-disabled="true" title={link.hint}>
                      <ArrowUpRight size={14} strokeWidth={2} />
                      {link.label}
                    </div>
                  )}
                  <div className="log-sel-sep" />
                </>
              )
            })()}
            {/* Include/Exclude are offered on tags only. Filtering on a whole
                message body would pin the query to one record — the useful
                message filter is a phrase, which the text-selection menu
                already handles by letting the user pick one. */}
            {!isMsg && hasValue && (
              <>
                <button className="log-sel-item" onClick={() => run(() => onAddChip({ field: menu.field, op: 'eq', value: menu.value }))}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Include
                </button>
                <button className="log-sel-item" onClick={() => run(() => onAddChip({ field: menu.field, op: 'neq', value: menu.value }))}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Exclude
                </button>
              </>
            )}
            {!isMsg && (
              <button className="log-sel-item" onClick={() => run(() => onAddChip({ field: menu.field, op: 'exists' }))}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Exists
              </button>
            )}
            {isMsg && (
              <div className="log-sel-note">Select any phrase in the value to filter on it.</div>
            )}
            {!isMsg && (
              <>
                <div className="log-sel-sep" />
                <button className="log-sel-item" onClick={() => run(() => onDistribution(menu.field, menu.x, menu.y))}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
                  View distribution
                </button>
              </>
            )}
            {hasValue && (
              <>
                <div className="log-sel-sep" />
                <button className="log-sel-item" onClick={() => run(() => onCopy(menu.value, 'Value copied to clipboard'))}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  Copy value
                </button>
              </>
            )}
          </div>
        )
      })()}
    </aside>
  )
}

export default function LogsView({ goHome, timeRange, setTimeRange, setToast, onOpenLink, incomingChip, onIncomingChipApplied }) {
  const [filters, setFilters] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [chips, setChips] = useState([])
  const [runRequested, setRunRequested] = useState(false)
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
  const [builderBlocked, setBuilderBlocked] = useState(null)

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

  // `effectiveChips` is what the QUERY BAR currently spells; `appliedChips` is
  // what the RESULTS reflect. They are separate because re-filtering on every
  // chip edit means, against a real backend, one request per chip — expensive
  // and mostly wasted, since a half-built query is rarely the one wanted. A run
  // (the Run button, or Enter in the bar) is what moves the bar's state into
  // the results.
  //
  // Seeded from the default query rather than left empty, so the page still
  // auto-loads on mount instead of showing a blank "click Search" screen.
  const [appliedChips, setAppliedChips] = useState(effectiveChips)
  // Pipes defer the same way. A group-by or aggregation is part of the query,
  // not a view toggle, so picking one costs a request just like a chip does —
  // and switching to an aggregate panel before the user has run anything shows
  // a result they never asked for.
  const [appliedPipes, setAppliedPipes] = useState([])
  // Running a query is a request, even though the mock resolves in a microtask.
  // Keeping the round trip here — rather than assigning state inline — is what
  // lets the in-flight, stale and failed states exist at all; swapping the
  // resolved promise for a real fetch is the whole integration.
  const [queryState, setQueryState] = useState({ status: 'idle', error: null })
  const runSeq = useRef(0)

  const runQuery = useCallback(() => {
    const nextChips = effectiveChips
    const nextPipes = pipes
    const seq = ++runSeq.current
    setQueryState({ status: 'running', error: null })
    Promise.resolve()
      .then(() => {
        // A reply from a superseded run must not overwrite a newer one.
        if (seq !== runSeq.current) return
        setAppliedChips(nextChips)
        setAppliedPipes(nextPipes)
        setQueryState({ status: 'idle', error: null })
      })
      .catch(err => {
        if (seq !== runSeq.current) return
        // The previous results stay on screen behind the message: a failed
        // refresh is not a reason to throw away what the user was reading.
        setQueryState({ status: 'error', error: err?.message || 'Could not run this query. Check the connection and try again.' })
      })
  }, [effectiveChips, pipes])

  useEffect(() => {
    if (!runRequested) return
    setRunRequested(false)
    runQuery()
  }, [runRequested, runQuery])

  const isRunning = queryState.status === 'running'

  // Whether the bar has moved on from what the table is showing. Compared by
  // serialization so a re-render with an equal-but-new array is not "dirty".
  const queryDirty =
    chipsToString(effectiveChips) !== chipsToString(appliedChips)
    || serializePipes(withImpliedCount(pipes)) !== serializePipes(withImpliedCount(appliedPipes))

  // A query that cannot run, and why. Raw-mode parse failures and the builder's
  // own unfinished-filter/typing errors are the same kind of problem here.
  const runBlocked = queryMode === 'raw'
    ? (rawParse.ok ? null : rawParse.error)
    : builderBlocked
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
  const [myQueriesOpen, setMyQueriesOpen] = useState(false)
  const [saveQueryOpen, setSaveQueryOpen] = useState(false)
  const [savedQueries, setSavedQueries] = useState([])
  const [originId, setOriginId] = useState(null)
  const myQueriesBtnRef = useRef(null)
  const saveQueryBtnRef = useRef(null)
  // Saved-query state disabled — kept for future restoration:
  //   const [historySaved, setHistorySaved] = useState(
  //     () => Object.fromEntries(QUERY_HISTORY.map(h => [h.id, h.saved]))
  //   )
  //   const toggleHistorySave = useCallback((id, name) => {
  //     setHistorySaved(prev => ({ ...prev, [id]: name }))
  //   }, [])
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)

  useEffect(() => {
    if (!moreOpen) return
    const handler = (e) => { if (!moreRef.current?.contains(e.target)) setMoreOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [moreOpen])

  // Re-running a past query means putting it back in the builder, not just
  // filtering by its text: parse it into chips so the bar shows the same
  // filters it originally ran with and the results follow from them. Pipes are
  // reset because a history entry is a whole query — leaving a stale group-by
  // attached would show something the entry never produced.
  const applyHistoryQuery = useCallback((q) => {
    const parsed = tryParseConditions(splitQuery(q).conditions)
    if (parsed.ok) {
      setChips(parsed.chips)
      setPipes([])
      setQuery('')
    } else {
      // Not expressible as chips — fall back to matching it against the body.
      setQuery(q)
    }
    setHistoryOpen(false)
  }, [])

  // rawQuery.js imports from QueryBuilder, so the builder can't import the
  // parser back without a cycle — the parse is injected from here instead.
  //
  // `ok: false` with no error means "this isn't a query, it's a value": the
  // builder lets those paste as ordinary text rather than complaining.
  const parsePastedQuery = useCallback((raw) => {
    const { conditions, pipes: pipeStages } = splitQuery(raw)
    const parsed = tryParseConditions(conditions)
    if (!parsed.ok) {
      return { ok: false, error: LOOKS_LIKE_QUERY.test(raw) ? parsed.error : null }
    }

    const pipeRes = pipeStages.length ? parsePipes(pipeStages) : null
    // A stage the builder can't represent at all refuses the whole paste —
    // applying half of it would run a query the user never wrote.
    if (pipeRes && !pipeRes.ok && pipeRes.fatal) {
      return { ok: false, error: pipeRes.error }
    }

    const gotPipes = !!pipeRes?.ok && pipeRes.pipes.length > 0
    if (!parsed.chips.length && !gotPipes) return { ok: false, error: null }

    // A malformed pipe section still lets the filters through; the reason rides
    // along so the user knows the pipe half didn't land.
    // A typo in the pipe section shouldn't destroy pipe controls the user
    // already set, so those are left as they are — the wording has to say so.
    const notice = pipeRes && !pipeRes.ok
      ? `Applied the filters. The pipe section was left as it is — ${pipeRes.error}`
      : pipeRes?.unsupported?.length
        ? `Kept ${pipeRes.unsupported.map(n => `“${n}”`).join(', ')} as written — no builder control for ${pipeRes.unsupported.length > 1 ? 'those stages' : 'that stage'}, so ${pipeRes.unsupported.length > 1 ? 'they' : 'it'} shows only in the generated query.`
        : null

    return {
      ok: true,
      chips: parsed.chips,
      // Only a paste that carried a pipe section touches the pipe controls;
      // one without leaves whatever is already configured alone.
      pipes: gotPipes ? pipeRes.pipes : null,
      notice,
    }
  }, [])

  // Replaces the pipe config wholesale, so what runs is what was pasted rather
  // than the paste plus a leftover stage. Any open math editor is pointing at a
  // pipe that no longer exists, so it closes with it.
  const applyPastedPipes = useCallback((next) => {
    setPipes(next)
    setMathPopOpen(false)
    setEditingMathId(null)
  }, [])

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

  // A filter handed in from another page - the trace view's "check logs".
  //
  // It replaces the query rather than appending, because arriving with someone
  // else's filters still applied is not what the button promised; and it runs
  // itself, because a filter that lands in the bar unapplied looks like the
  // button did nothing.
  //
  // A trace id is matched across every spelling: one instance can hold trace_id
  // and trace.id at once, and asking for either alone silently drops the rest
  // of the trace's logs.
  useEffect(() => {
    if (!incomingChip) return
    const spellings = ALIASES[incomingChip.concept] ?? [incomingChip.field]
    const leaves = spellings.map((field, i) => ({
      field, op: 'eq', value: incomingChip.value,
      ...(i > 0 ? { connector: 'OR' } : {}),
    }))
    setChips(leaves.length > 1 ? [newGroup(leaves)] : leaves)
    setRunRequested(true)
    onIncomingChipApplied?.()
  }, [incomingChip])   // eslint-disable-line react-hooks/exhaustive-deps

  // Shared by every copy action in the record drawer, so all of them report
  // through the same toast the query bar already uses.
  // Pins live here rather than in the drawer so they survive closing it, not
  // just stepping between records — a field you chose to watch stays watched.
  const [pinnedFields, setPinnedFields] = useState([])
  const togglePinnedField = useCallback((field) => {
    setPinnedFields(prev => prev.includes(field)
      ? prev.filter(f => f !== field)
      : [...prev, field])
  }, [])

  const copyText = useCallback((text, message) => {
    try { navigator.clipboard.writeText(text)?.catch(() => {}) } catch (_) {}
    setToast?.(message)
  }, [setToast])

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

  // The panel keeps its own selection, separate from the query bar's chips.
  // An empty set means nothing is ruled out for that field, which is why the
  // list starts unticked: no selection and every value selected would filter
  // the same rows, and unticked is the one that leaves the query bar alone.
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

  const facetFields = useMemo(() => {
    const keys = Object.keys(logFacets)
    const lead = FACET_LEAD.filter(k => keys.includes(k))
    const rest = keys.filter(k => !lead.includes(k)).sort()
    return [...lead, ...rest]
  }, [])

  // Rows matching chips/query/facets but NOT the time window — used to build the volume histogram.
  const chipFilteredRows = useMemo(() => {
    // Every facet the panel shows filters, not just the two it once listed:
    // the field list is derived from the rows now, so naming fields here would
    // leave the rest of the panel decorative.
    const active = Object.entries(filters).filter(([, set]) => set?.size)
    return logRows.filter(l => {
      for (const [field, set] of active) {
        if (!set.has(String(facetValueOf(l, field) ?? ''))) return false
      }
      if (query && !l.message.toLowerCase().includes(query.toLowerCase())) return false
      if (appliedChips.length && !applyChipsToLog(l, appliedChips)) return false
      return true
    })
  }, [filters, query, appliedChips])

  // Literal strings the user is searching the message body for — the free-text
  // chips plus the facet search box. Regex chips are left out: their value is a
  // pattern, not the text that will appear in the line.
  const searchTerms = useMemo(() => {
    const terms = flattenLeaves(appliedChips)
      .filter(c => c.field === '_msg' && c.op !== 'regex' && c.op !== 'nregex')
      .flatMap(c => (Array.isArray(c.value) ? c.value : [c.value]))
      .map(v => String(v ?? '').trim())
      .filter(Boolean)
    if (query.trim()) terms.push(query.trim())
    return [...new Set(terms)].sort((a, b) => b.length - a.length)
  }, [appliedChips, query])

  // Pill edits in raw mode rewrite only the pipe section, leaving the
  // hand-written conditions head untouched. Writing the same string back is a
  // no-op for React, so this can't feed back into itself.
  useEffect(() => {
    if (queryMode !== 'raw') return
    setRawText(prev => replacePipeSection(prev, serializePipes(pipes)))
  }, [pipes, queryMode])

  // Reads appliedPipes, not pipes: everything downstream of here is results, and
  // results only move on Run.
  const effectivePipes = useMemo(() => withImpliedCount(appliedPipes), [appliedPipes])

  // The live counterpart, for the generated-query preview only.
  const livePipes = useMemo(() => withImpliedCount(pipes), [pipes])

  // The applied counterparts of statsFunctions/groupBy. The pills read the live
  // pipes so the controls stay responsive; the results panel reads these, so it
  // keeps showing the log table until the aggregate query is actually run.
  const appliedStatsFunctions = useMemo(
    () => appliedPipes.filter(p => p.kind === 'stats').flatMap(p => p.functions || []),
    [appliedPipes]
  )
  const appliedGroupBy = useMemo(
    () => appliedPipes.find(p => p.kind === 'stats')?.groupBy || [],
    [appliedPipes]
  )

  // What the bar currently spells. Live, not applied: it tracks every edit
  // rather than waiting for Run, because the query worth reading while you
  // build it is the one you are about to run. The results deliberately lag.
  //
  // One expression feeds both the preview and the copy button, so the two can
  // never disagree about what the query is.
  const spelledQuery = useMemo(
    () => (queryMode === 'raw'
      ? rawText.trim()
      : composeQuery(chipsToString(effectiveChips), livePipes)),
    [queryMode, rawText, effectiveChips, livePipes]
  )

  // The preview is always on screen. An empty bar is not the absence of a
  // query, it is `*`, and saying so is the whole value of the strip: somewhere
  // to read what will run that is in the same place every time you look.
  const composedQuery = spelledQuery || '*'

  // Copy stays gated on there being something to copy — handing over `*` would
  // be handing over nothing.
  const copyableQuery = spelledQuery

  // Saving stores what the builder holds, not what it renders to — see
  // SaveQueryPopover. Raw mode has no chips to store, and a query of `*` is
  // not worth a name, so neither can be saved.
  const canSaveQuery = queryMode !== 'raw' && (effectiveChips.length > 0 || livePipes.length > 0)

  // Whether what is on screen has already been saved. Compared on the composed
  // query rather than the name, because the question the button answers is
  // "have I kept this one", not "is there something called this".
  //
  // Only the user's own saves count. The examples are a starting point, not
  // something they put there, so landing on one should still offer to keep it.
  const matchesQuery = useCallback(
    (q) => composeQuery(chipsToString(q.chips ?? []), withImpliedCount(q.pipes ?? [])) === spelledQuery,
    [spelledQuery]
  )

  const savedAs = useMemo(
    () => (canSaveQuery ? savedQueries.find(matchesQuery) ?? null : null),
    [savedQueries, matchesQuery, canSaveQuery]
  )

  // Where the query on screen came from. Not derivable from the query itself —
  // once edited it matches nothing — so it is carried from the moment a saved
  // query was opened or written.
  const origin = useMemo(
    () => savedQueries.find(q => q.id === originId) ?? null,
    [savedQueries, originId]
  )

  // Offered only once the query has drifted from its origin. While it still
  // matches, `savedAs` covers it and there is nothing to update.
  const updatable = origin && !savedAs ? origin : null

  // Emptying the bar ends the lineage: nothing is left that descended from
  // anything. Any lesser edit keeps it.
  useEffect(() => {
    if (!canSaveQuery) setOriginId(null)
  }, [canSaveQuery])

  // The note under the bar answers "what am I looking at" after a query is
  // applied from the panel, so it reads the examples too — those are the ones
  // whose purpose is least obvious from the query itself.
  //
  // Derived from the query rather than set when one is applied: editing away
  // should drop the note, because it would otherwise describe something that
  // is no longer on screen.
  const queryNote = useMemo(() => {
    if (!canSaveQuery) return null
    return savedQueries.find(matchesQuery) ?? SAVED_QUERIES.find(matchesQuery) ?? null
  }, [savedQueries, matchesQuery, canSaveQuery])

  // `lockTime` is the difference between saving a question and saving an
  // answer: locked keeps the window the query was written for, unlocked lets
  // it follow whatever range is on screen when it is next opened.
  //
  // Only one query can be the default, so setting the flag clears it
  // elsewhere rather than leaving two claims to the same slot.
  const saveQuery = useCallback((name, description, { lockTime, defaultView } = {}) => {
    const entry = {
      id: `sq-${Date.now()}`,
      savedAt: Date.now(),
      name,
      description,
      chips: effectiveChips,
      pipes,
      timeRange: lockTime ? timeRange : null,
      isDefault: !!defaultView,
    }
    setSavedQueries(prev => [
      entry,
      ...(defaultView ? prev.map(q => ({ ...q, isDefault: false })) : prev),
    ])
    // What is on screen now descends from this entry, so editing it next offers
    // to update it rather than only to save a third copy.
    setOriginId(entry.id)
    setToast?.(`Saved “${name}” to My Queries`)
  }, [effectiveChips, pipes, timeRange, setToast])

  const updateQuery = useCallback((id, name, description, { lockTime, defaultView } = {}) => {
    setSavedQueries(prev => prev.map(q => {
      if (q.id !== id) return defaultView ? { ...q, isDefault: false } : q
      return {
        ...q,
        name,
        description,
        chips: effectiveChips,
        pipes,
        timeRange: lockTime ? timeRange : null,
        isDefault: !!defaultView,
        updatedAt: Date.now(),
      }
    }))
    setToast?.(`Updated “${name}”`)
  }, [effectiveChips, pipes, timeRange, setToast])

  // Reapplying runs it. A saved query is a destination, not a draft — landing
  // on the builder with the filters loaded but the old results still showing
  // would be the one state nobody wants.
  const applySavedQuery = useCallback((q) => {
    const nextChips = q.chips ?? []
    const nextPipes = q.pipes ?? []
    setChips(nextChips)
    setAppliedChips(nextChips)
    setPipes(nextPipes)
    setAppliedPipes(nextPipes)
    setQuery('')
    // Only when it was locked. Otherwise the range on screen is the one the
    // user chose most recently, and overriding it would undo that silently.
    if (q.timeRange) setTimeRange?.(q.timeRange)
    // Examples have no id, so opening one starts no lineage: there is nothing
    // of the user's to update, only a new query to save.
    setOriginId(q.id ?? null)
    setMyQueriesOpen(false)
  }, [setTimeRange])

  const deleteSavedQuery = useCallback((id) => {
    setSavedQueries(prev => prev.filter(q => q.id !== id))
    setOriginId(prev => (prev === id ? null : prev))
  }, [])

  const copyQuery = useCallback(() => {
    if (!copyableQuery) return
    // writeText rejects rather than throws when the clipboard is blocked, so
    // both paths need swallowing or the console fills with unhandled rejections.
    try { navigator.clipboard.writeText(copyableQuery)?.catch(() => {}) } catch (_) {}
    setToast?.(livePipes.length > 0
      ? 'This query has been copied to clipboard along with pipes'
      : 'This query has been copied to clipboard')
  }, [copyableQuery, livePipes, setToast])

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
    // appliedChips, not chips — the chart must agree with the table, and in raw
    // mode `chips` is empty anyway (the active filter comes from parsed raw
    // text), which would short-circuit to the unfiltered baseline.
    const hasFilters = appliedChips.length > 0 || !!query || Object.values(filters).some(s => s?.size)
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
  }, [chipFilteredRows, filters, query, appliedChips])

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
  // Position within the rows currently on screen, so stepping through records
  // walks the same list the table shows rather than the unfiltered set.
  const selectedIndex = selectedId ? filtered.findIndex(l => l.id === selectedId) : -1

  return (
    <>
      <PageBar
        timeRange={timeRange}
        setTimeRange={wrappedSetTimeRange}
        actions={
          <div className="query-actions">
            <button
              ref={saveQueryBtnRef}
              className={`pipe-btn${savedAs ? ' is-saved' : ''}${saveQueryOpen ? ' is-active' : ''}`}
              disabled={!canSaveQuery || !!savedAs}
              title={savedAs
                ? `Saved as “${savedAs.name}”`
                : canSaveQuery
                  ? 'Save query'
                  : 'Add a filter or a pipe first — there is nothing to save yet'}
              aria-label={savedAs ? `Saved as ${savedAs.name}` : 'Save query'}
              onClick={() => setSaveQueryOpen(o => !o)}
            >
              {savedAs ? <BookmarkCheck strokeWidth={2} /> : <BookmarkPlus strokeWidth={2} />}
              {savedAs ? 'Saved' : 'Save Query'}
            </button>
            <button
              ref={myQueriesBtnRef}
              className={`pipe-btn${myQueriesOpen ? ' is-active' : ''}`}
              onClick={() => setMyQueriesOpen(true)}
            >
              <List strokeWidth={2} />
              My Queries
            </button>
          </div>
        }
      >
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
        {/* The facets scroll; the header does not, so "Clear all" stays reachable
            however far down the list you are. */}
        <div className="logs-filters-scroll">
          {facetFields.map(field => (
            <FacetGroup
              key={field}
              title={field}
              options={logFacets[field]}
              selected={getSet(field)}
              onToggle={toggleFilter}
            />
          ))}
        </div>
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
        {queryNote && (
          <div className="logs-query-note">
            <Star className="logs-query-note-star" strokeWidth={2} aria-hidden="true" />
            <span className="logs-query-note-name">{queryNote.name}</span>
            {queryNote.description && (
              <span className="logs-query-note-desc">{queryNote.description}</span>
            )}
          </div>
        )}
        <div className="logs-query-bar">
          <QueryBuilder
            chips={chips}
            setChips={setChips}
            recents={recents}
            addRecent={addRecent}
            onRun={runQuery}
            onBlockedChange={setBuilderBlocked}
            onCopyQuery={copyableQuery ? copyQuery : null}
            parsePastedQuery={parsePastedQuery}
            onApplyPipes={applyPastedPipes}
          />
          <button className="hbtn small icon-only" title="Query history" aria-label="Query history" onClick={() => setHistoryOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
          </button>
          <button
            className={`hbtn primary run-btn${queryDirty && !runBlocked && !isRunning ? ' is-dirty' : ''}${isRunning ? ' is-running' : ''}`}
            title={runBlocked || (isRunning ? 'Running…' : queryDirty ? 'Run query — the bar has changes the results do not show yet' : 'Run query')}
            aria-label={isRunning ? 'Running query' : 'Run query'}
            disabled={!!runBlocked || isRunning}
            onClick={() => { addRecent(chips); runQuery() }}
          >
            {isRunning ? (
              <svg className="run-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 01-4 4H4"/></svg>
            )}
            {isRunning ? 'Running' : 'Run'}
          </button>
          <div className="logs-more-wrap" ref={moreRef}>
            <button
              className="hbtn small icon-only"
              title="More actions"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(o => !o)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
            </button>
            {moreOpen && (
              <div className="logs-more-menu" role="menu">
                <button role="menuitem" className="logs-more-item" onClick={() => { downloadCSV(filtered); setMoreOpen(false) }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download CSV
                </button>
                <button role="menuitem" className="logs-more-item" onClick={() => { setAlertOpen(true); setMoreOpen(false) }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 004 0"/><line x1="12" y1="2" x2="12" y2="4"/></svg>
                  Create Alert
                </button>
                <a
                  role="menuitem"
                  className="logs-more-item"
                  href="https://docs.cubeapm.com/logs/querying"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMoreOpen(false)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Learn about Querying
                </a>
              </div>
            )}
          </div>
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
        <SaveQueryPopover
          anchorRef={saveQueryBtnRef}
          open={saveQueryOpen}
          onClose={() => setSaveQueryOpen(false)}
          onSave={saveQuery}
          preview={composedQuery}
          existingNames={savedQueries.map(q => q.name)}
          timeRange={timeRange}
          origin={updatable}
          onUpdate={updateQuery}
          previousQuery={updatable
            ? composeQuery(chipsToString(updatable.chips ?? []), withImpliedCount(updatable.pipes ?? []))
            : null}
        />
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

        <div className="logs-query-preview">
          <span className="qb-preview-label">Generated Query</span>
          <code className="qb-preview-code">{composedQuery}</code>
        </div>

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

        {/* A failed run keeps the previous results underneath — losing what you
            were reading because a refresh failed is worse than the failure. */}
        {queryState.status === 'error' && (
          <div className="logs-query-error" role="alert">
            <AlertCircle size={14} strokeWidth={2} />
            <span className="logs-query-error-msg">{queryState.error}</span>
            <button type="button" className="logs-query-retry" onClick={runQuery}>Try again</button>
            <button
              type="button"
              className="logs-query-error-x"
              onClick={() => setQueryState({ status: 'idle', error: null })}
              aria-label="Dismiss"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}

        <div className={`logs-results${isRunning ? ' is-stale' : ''}`} aria-busy={isRunning}>
        {appliedStatsFunctions.length === 0 && appliedGroupBy.length === 0 ? (<>
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
      </div>

      {selected && (
        <LogRecordDrawer
          record={selected}
          onClose={() => setSelectedId(null)}
          searchTerms={searchTerms}
          onAddChip={addChipToQuery}
          onOpenLink={onOpenLink}
          onDistribution={(field, x, y) => setDistField({ field, x, y })}
          onCopy={copyText}
          index={selectedIndex}
          total={filtered.length}
          onNavigate={(i) => { const row = filtered[i]; if (row) setSelectedId(row.id) }}
          pinned={pinnedFields}
          onTogglePin={togglePinnedField}
        />
      )}
      </div>
    </div>
    {alertOpen && <AlertDrawer filters={filters} query={query} onClose={() => setAlertOpen(false)} />}
    {patternsOpen && <PatternsDrawer onClose={() => setPatternsOpen(false)} />}
    {myQueriesOpen && (
      <MyQueriesDrawer
        onClose={() => setMyQueriesOpen(false)}
        saved={savedQueries}
        examples={SAVED_QUERIES}
        onApply={applySavedQuery}
        onDelete={deleteSavedQuery}
      />
    )}
    {historyOpen && (
      <QueryHistoryDrawer
        onClose={() => setHistoryOpen(false)}
        onApply={applyHistoryQuery}
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

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { logRows } from '@/data/observability'

// ---------- Field catalog ----------

const FIELD_CATALOG = [
  { field: 'service', type: 'string', desc: 'Service name' },
  { field: 'log.level', type: 'string', desc: 'Log severity' },
  { field: 'env', type: 'string', desc: 'Environment' },
  { field: 'endpoint', type: 'string', desc: 'Request endpoint' },
  { field: 'path', type: 'string', desc: 'Request path' },
  { field: 'log.exception.type', type: 'string', desc: 'Exception class' },
  { field: 'http.status', type: 'number', desc: 'HTTP status code' },
  { field: 'duration_ms', type: 'number', desc: 'Request duration (ms)' },
  { field: 'trace_id', type: 'string', desc: 'Trace identifier', highCard: true },
]

const FIELD_BY_NAME = Object.fromEntries(FIELD_CATALOG.map(f => [f.field, f]))

// Operators are filtered by field type — a string field never offers `>`
const OPERATORS = {
  string: [
    { op: ':', label: 'is', hint: 'Exact match' },
    { op: '!=', label: 'is not', hint: 'Excludes this value' },
    { op: '~', label: 'contains', hint: 'Substring match', freeText: true },
    { op: 'EXISTS', label: 'exists', hint: 'Field is present', noValue: true },
  ],
  number: [
    { op: ':', label: 'equals', hint: 'Exact match' },
    { op: '!=', label: 'not equals', hint: 'Excludes this value' },
    { op: '>', label: 'greater than', hint: 'Numeric compare', freeText: true },
    { op: '>=', label: 'greater or equal', hint: 'Numeric compare', freeText: true },
    { op: '<', label: 'less than', hint: 'Numeric compare', freeText: true },
    { op: '<=', label: 'less or equal', hint: 'Numeric compare', freeText: true },
    { op: 'EXISTS', label: 'exists', hint: 'Field is present', noValue: true },
  ],
}

const SAVED_QUERIES = [
  { name: 'Payments — errors last hour', chips: [
    { field: 'service', op: ':', value: 'payment' },
    { field: 'log.level', op: ':', value: 'error' },
  ]},
  { name: 'Slow requests over 800ms', chips: [
    { field: 'duration_ms', op: '>', value: '800' },
  ]},
  { name: 'Server errors (5xx)', chips: [
    { field: 'http.status', op: '>=', value: '500' },
  ]},
  { name: 'Connection failures', chips: [
    { field: 'log.exception.type', op: ':', value: 'ConnectionRefusedException' },
  ]},
]

function getFieldValue(log, field) {
  if (field === 'log.level') return log.level
  if (field === 'service') return log.service
  return log.tags?.[field]
}

function computeTopValues(field, k = 24) {
  const meta = FIELD_BY_NAME[field]
  if (meta?.highCard) return null
  const counts = {}
  for (const l of logRows) {
    const v = getFieldValue(l, field)
    if (v != null && v !== '') {
      const key = String(v)
      counts[key] = (counts[key] || 0) + 1
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([value, count]) => ({ value, count }))
}

export function chipsToString(chips) {
  return chips.map(c => {
    if (c.op === 'EXISTS') return `${c.field} EXISTS`
    if (c.op === ':') return `${c.field}:${c.value}`
    return `${c.field} ${c.op} ${c.value}`
  }).join(' AND ')
}

export function applyChipsToLog(log, chips) {
  for (const c of chips) {
    const raw = getFieldValue(log, c.field)
    if (c.op === 'EXISTS') {
      if (raw == null || raw === '') return false
      continue
    }
    if (raw == null) return false
    const s = String(raw)
    if (c.op === ':') { if (s !== String(c.value)) return false; continue }
    if (c.op === '!=') { if (s === String(c.value)) return false; continue }
    if (c.op === '~') {
      if (!s.toLowerCase().includes(String(c.value).toLowerCase())) return false
      continue
    }
    const a = parseFloat(s)
    const b = parseFloat(c.value)
    if (Number.isNaN(a) || Number.isNaN(b)) return false
    if (c.op === '>' && !(a > b)) return false
    if (c.op === '>=' && !(a >= b)) return false
    if (c.op === '<' && !(a < b)) return false
    if (c.op === '<=' && !(a <= b)) return false
  }
  return true
}

// ---------- Component ----------

export default function QueryBuilder({ chips, setChips, recents = [], addRecent, onRun }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  // null → field phase | { field, type, highCard } → operator phase | { …, op } → value phase
  const [composing, setComposing] = useState(null)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const phase = !composing ? 'field' : composing.op == null ? 'operator' : 'value'

  const closeOverlay = useCallback(() => {
    setOpen(false)
    setHighlight(0)
  }, [])

  // Whether the value phase needs a typed value instead of a picklist
  const opMeta = composing?.op
    ? OPERATORS[composing.type].find(o => o.op === composing.op)
    : null
  const needsTypedValue = !!(composing?.highCard || opMeta?.freeText)

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase()

    if (phase === 'operator') {
      const ops = OPERATORS[composing.type] || OPERATORS.string
      const filtered = q
        ? ops.filter(o => o.op.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))
        : ops
      return { mode: 'operators', items: filtered }
    }

    if (phase === 'value') {
      if (needsTypedValue) return { mode: 'typed-value' }
      const values = computeTopValues(composing.field)
      const filtered = q ? values.filter(v => v.value.toLowerCase().includes(q)) : values
      return { mode: 'values', items: filtered }
    }

    const rec = recents
      .filter(r => !q || chipsToString(r).toLowerCase().includes(q))
      .slice(0, 5)
    const sav = SAVED_QUERIES.filter(s =>
      !q || s.name.toLowerCase().includes(q) || chipsToString(s.chips).toLowerCase().includes(q)
    )
    const fac = FIELD_CATALOG.filter(f =>
      !q || f.field.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q)
    )
    return { mode: 'fields', recents: rec, saved: sav, facets: fac }
  }, [text, phase, composing, needsTypedValue, recents])

  const flatItems = useMemo(() => {
    if (suggestions.mode === 'fields') {
      return [
        ...suggestions.recents.map((r, i) => ({ kind: 'recent', payload: r, key: `r${i}` })),
        ...suggestions.saved.map((s, i) => ({ kind: 'saved', payload: s, key: `s${i}` })),
        ...suggestions.facets.map((f, i) => ({ kind: 'facet', payload: f, key: `f${i}` })),
      ]
    }
    if (suggestions.mode === 'operators') {
      return suggestions.items.map((o, i) => ({ kind: 'operator', payload: o, key: `o${i}` }))
    }
    if (suggestions.mode === 'values') {
      return suggestions.items.map((v, i) => ({ kind: 'value', payload: v, key: `v${i}` }))
    }
    return []
  }, [suggestions])

  useEffect(() => { setHighlight(0) }, [flatItems.length, phase, composing?.field, composing?.op])

  useEffect(() => {
    if (!open || !listRef.current) return
    const rows = listRef.current.querySelectorAll('.qb-ov-row')
    rows[highlight]?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (!wrapRef.current?.contains(e.target)) closeOverlay() }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, closeOverlay])

  const applyChipSet = (nextChips) => {
    setChips(nextChips)
    setComposing(null)
    setText('')
    closeOverlay()
    addRecent?.(nextChips)
  }

  const commitChip = (chip) => {
    setChips([...chips, chip])
    setComposing(null)
    setText('')
    inputRef.current?.focus()
  }

  const commitItem = (item) => {
    if (!item) return
    if (item.kind === 'facet') {
      const f = item.payload
      setComposing({ field: f.field, type: f.type, highCard: !!f.highCard })
      setText('')
      inputRef.current?.focus()
      return
    }
    if (item.kind === 'operator') {
      const o = item.payload
      if (o.noValue) { commitChip({ field: composing.field, op: o.op }); return }
      setComposing({ ...composing, op: o.op })
      setText('')
      inputRef.current?.focus()
      return
    }
    if (item.kind === 'value') {
      commitChip({ field: composing.field, op: composing.op, value: item.payload.value })
      return
    }
    if (item.kind === 'recent') { applyChipSet(item.payload); return }
    if (item.kind === 'saved') { applyChipSet(item.payload.chips); return }
  }

  const commitTypedValue = () => {
    if (!composing?.op || !text.trim()) return
    commitChip({ field: composing.field, op: composing.op, value: text.trim() })
  }

  const stepBack = () => {
    if (!composing) {
      if (chips.length) setChips(chips.slice(0, -1))
      return
    }
    if (composing.op != null) setComposing({ ...composing, op: undefined })
    else setComposing(null)
  }

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true); e.preventDefault(); return
    }
    if (e.key === 'Backspace' && !text) {
      e.preventDefault(); stepBack(); return
    }
    if (!open) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, Math.max(flatItems.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (flatItems.length > 0) {
        e.preventDefault()
        commitItem(flatItems[highlight])
      } else if (needsTypedValue && text.trim()) {
        e.preventDefault()
        commitTypedValue()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        addRecent?.(chips)
        onRun?.()
        closeOverlay()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeOverlay()
    }
  }

  const removeChip = (idx, e) => {
    e?.stopPropagation()
    setChips(chips.filter((_, i) => i !== idx))
    inputRef.current?.focus()
  }

  const placeholder = phase === 'operator'
    ? `Choose an operator for ${composing.field}…`
    : phase === 'value'
      ? (needsTypedValue ? `Type a value for ${composing.field}…` : `Search values for ${composing.field}…`)
      : chips.length
        ? 'Add another filter'
        : 'Type a field name (e.g. service, duration_ms) or free text'

  return (
    <div className="qb-wrap" ref={wrapRef}>
      <div className="qb-input-row" onClick={() => inputRef.current?.focus()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
        </svg>

        {chips.map((c, i) => (
          <span key={`${c.field}${c.op}${c.value}${i}`} className="qb-chip">
            <span className="qb-chip-field">{c.field}</span>
            <span className="qb-chip-op">{c.op}</span>
            {c.op !== 'EXISTS' && <span className="qb-chip-value">{c.value}</span>}
            <button
              type="button"
              className="qb-chip-x"
              onClick={(e) => removeChip(i, e)}
              aria-label={`Remove filter ${c.field} ${c.op} ${c.value ?? ''}`}
              title="Remove filter"
            >×</button>
          </span>
        ))}

        {composing && (
          <span className="qb-composing" aria-live="polite">
            <span className="qb-composing-field">{composing.field}</span>
            {composing.op != null && <span className="qb-composing-op">{composing.op}</span>}
          </span>
        )}

        <input
          ref={inputRef}
          className="qb-input"
          value={text}
          onChange={(e) => { setText(e.target.value); if (!open) setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {open && (
        <div className="qb-overlay" role="listbox">
          <div ref={listRef} className="qb-overlay-scroll">

            {suggestions.mode === 'fields' && (
              <>
                <Section label="Recent Searches" meta={suggestions.recents.length ? `Last ${suggestions.recents.length}` : 'Empty'}>
                  {suggestions.recents.length === 0 ? (
                    <Empty>No recent searches yet — run a query to save it here.</Empty>
                  ) : suggestions.recents.map((r, i) => {
                    const idx = flatItems.findIndex(x => x.key === `r${i}`)
                    return (
                      <Row key={`r${i}`} icon="⟲" active={idx === highlight}
                        onHover={() => setHighlight(idx)} onPick={() => commitItem(flatItems[idx])}
                        label={<span className="mono">{chipsToString(r) || '(empty query)'}</span>} />
                    )
                  })}
                </Section>

                <Section label="Saved Queries" meta="Team">
                  {suggestions.saved.length === 0 ? (
                    <Empty>No saved queries match "{text}"</Empty>
                  ) : suggestions.saved.map((s, i) => {
                    const idx = flatItems.findIndex(x => x.key === `s${i}`)
                    return (
                      <Row key={`s${i}`} icon="☆" active={idx === highlight}
                        onHover={() => setHighlight(idx)} onPick={() => commitItem(flatItems[idx])}
                        label={<>
                          <span className="qb-ov-name">{s.name}</span>
                          <span className="qb-ov-preview mono">{chipsToString(s.chips)}</span>
                        </>} />
                    )
                  })}
                </Section>

                <Section label="Top Facets / Keys" meta="Indexed">
                  {suggestions.facets.length === 0 ? (
                    <Empty>No fields match "{text}"</Empty>
                  ) : suggestions.facets.map((f, i) => {
                    const idx = flatItems.findIndex(x => x.key === `f${i}`)
                    return (
                      <Row key={`f${i}`} icon={f.type === 'number' ? '#' : 'A'} active={idx === highlight}
                        onHover={() => setHighlight(idx)} onPick={() => commitItem(flatItems[idx])}
                        label={<>
                          <span className="mono">{f.field}</span>
                          <span className="qb-ov-meta">{f.highCard ? 'high cardinality' : f.desc}</span>
                        </>}
                        meta={<span className="qb-ov-type">{f.type}</span>} />
                    )
                  })}
                </Section>
              </>
            )}

            {suggestions.mode === 'operators' && (
              <Section
                label={`Operators for ${composing.field}`}
                meta={`${composing.type} field`}
              >
                {suggestions.items.map((o, i) => {
                  const idx = flatItems.findIndex(x => x.key === `o${i}`)
                  return (
                    <Row key={`o${i}`} icon={<span className="qb-ov-opsym">{o.op}</span>} active={idx === highlight}
                      onHover={() => setHighlight(idx)} onPick={() => commitItem(flatItems[idx])}
                      label={<>
                        <span className="qb-ov-name">{o.label}</span>
                        <span className="qb-ov-meta">{o.hint}</span>
                      </>} />
                  )
                })}
              </Section>
            )}

            {suggestions.mode === 'values' && (
              <Section
                label={`Values for ${composing.field}`}
                meta={`${suggestions.items.length} value${suggestions.items.length === 1 ? '' : 's'}`}
              >
                {suggestions.items.length === 0 ? (
                  <Empty>No values match "{text}". Press <kbd>Enter</kbd> to use it as an exact value.</Empty>
                ) : suggestions.items.map((v, i) => {
                  const idx = flatItems.findIndex(x => x.key === `v${i}`)
                  return (
                    <Row key={`v${i}`} icon="A" active={idx === highlight}
                      onHover={() => setHighlight(idx)} onPick={() => commitItem(flatItems[idx])}
                      label={<span className="mono">{v.value}</span>}
                      meta={<span className="mono">{v.count.toLocaleString()} logs</span>} />
                  )
                })}
              </Section>
            )}

            {suggestions.mode === 'typed-value' && (
              <div className="qb-hc-section">
                <div className="qb-ov-header">
                  <span className="qb-ov-lbl">Value for {composing.field}</span>
                  <span className="qb-ov-lbl-meta">{composing.highCard ? 'Exact match' : opMeta?.hint}</span>
                </div>
                <div className="qb-hc-body">
                  <p>
                    {composing.highCard
                      ? <><span className="mono">{composing.field}</span> is a high-cardinality field — too many distinct values to list. Type an exact value.</>
                      : composing.op === '~'
                        ? <>Type the text to match inside <span className="mono">{composing.field}</span>.</>
                        : <>Type a number to compare against <span className="mono">{composing.field}</span>.</>}
                  </p>
                  <button type="button" className="qb-hc-commit" disabled={!text.trim()} onClick={commitTypedValue}>
                    {text.trim()
                      ? `Add filter ${composing.field} ${composing.op} ${text.trim()}`
                      : 'Add filter'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="qb-ov-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>Tab</kbd> Insert &amp; continue</span>
            <span><kbd>↵</kbd> Commit</span>
            <span><kbd>⌫</kbd> Back</span>
            <span><kbd>Esc</kbd> Dismiss</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ label, meta, children }) {
  return (
    <div className="qb-ov-section">
      <div className="qb-ov-header">
        <span className="qb-ov-lbl">{label}</span>
        {meta && <span className="qb-ov-lbl-meta">{meta}</span>}
      </div>
      <div className="qb-ov-list">{children}</div>
    </div>
  )
}

function Empty({ children }) {
  return <div className="qb-ov-empty">{children}</div>
}

function Row({ icon, label, meta, active, onHover, onPick }) {
  return (
    <div
      role="option"
      aria-selected={active}
      className={`qb-ov-row${active ? ' hl' : ''}`}
      onMouseEnter={onHover}
      onMouseDown={(e) => { e.preventDefault(); onPick?.() }}
    >
      <span className="qb-ov-icon">{icon}</span>
      <span className="qb-ov-body">{label}</span>
      {meta && <span className="qb-ov-meta-cell">{meta}</span>}
    </div>
  )
}

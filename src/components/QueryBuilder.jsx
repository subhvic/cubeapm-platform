import { Fragment, useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { logRows } from '@/data/observability'

// ---------- Field catalog ----------
// Types map to CubeAPM's log query grammar (docs.cubeapm.com/logs/querying).
// `keyword` is short numeric/alphanumeric text (status codes, small ints) that
// still uses string-style operators — CubeAPM's log grammar has no `>`/`<`.

export const FIELD_CATALOG = [
  { field: 'service',            type: 'string',  desc: 'Service name' },
  { field: 'log.level',          type: 'string',  desc: 'Log severity' },
  { field: 'env',                type: 'string',  desc: 'Environment' },
  { field: 'endpoint',           type: 'string',  desc: 'Request endpoint' },
  { field: 'path',               type: 'string',  desc: 'Request path' },
  { field: 'log.exception.type', type: 'string',  desc: 'Exception class' },
  { field: 'http.status',        type: 'keyword', desc: 'HTTP status code' },
  { field: 'duration_ms',        type: 'keyword', desc: 'Request duration (ms)' },
  { field: 'trace_id',           type: 'string',  desc: 'Trace identifier', highCard: true },
]

const FIELD_BY_NAME = Object.fromEntries(FIELD_CATALOG.map(f => [f.field, f]))

// Operator catalog — mirrors CubeAPM query grammar.
// `sym` is what shows in the operator picker's icon slot.
// `freeText` = user must type a value (no picklist).
// `noValue`  = commit immediately, no value phase.
const OPERATORS = {
  string: [
    { op: 'word',     label: 'is (word)',      hint: 'field:value  — word/token match',                  sym: ':',     cat: 'Equality' },
    { op: 'eq',       label: 'is exactly',     hint: 'field:=value  — exact match',                      sym: ':=',    cat: 'Equality' },
    { op: 'neq',      label: 'is not',         hint: 'field!=value  — excludes this value',              sym: '!=',    cat: 'Equality' },
    { op: 'in',       label: 'in (list)',      hint: 'field in ("a","b")  — matches any of these',       sym: 'in',    cat: 'List',       multi: true },
    { op: 'not_in',   label: 'not in (list)',  hint: 'field not_in ("a","b")  — none of these',          sym: '!in',   cat: 'List',       multi: true },
    { op: 'contains', label: 'contains',       hint: 'field:*value*  — substring anywhere',              sym: ':*_*',  cat: 'Text',       freeText: true },
    { op: 'prefix',   label: 'starts with',    hint: 'field:value*  — prefix match',                     sym: ':_*',   cat: 'Text',       freeText: true },
    { op: 'phrase',   label: 'matches phrase', hint: 'field:"a b c"  — multi-word exact',                sym: ':"_"',  cat: 'Text',       freeText: true },
    { op: 'regex',    label: 'matches regex',  hint: 'field:~"pattern"  — regular expression',           sym: ':~',    cat: 'Pattern',    freeText: true },
    { op: 'nregex',   label: 'not regex',      hint: 'field!~"pattern"  — negated regex',                sym: '!~',    cat: 'Pattern',    freeText: true },
    { op: 'exists',   label: 'exists',         hint: 'field:*  — any non-empty value',                   sym: ':*',    cat: 'Presence',   noValue: true },
    { op: 'empty',    label: 'is empty',       hint: 'field:""  — field is present but empty',           sym: ':""',   cat: 'Presence',   noValue: true },
  ],
  keyword: [
    { op: 'word',     label: 'is',             hint: 'field:value  — word match',                        sym: ':',     cat: 'Equality' },
    { op: 'eq',       label: 'is exactly',     hint: 'field:=value  — exact match',                      sym: ':=',    cat: 'Equality' },
    { op: 'neq',      label: 'is not',         hint: 'field!=value  — excludes this value',              sym: '!=',    cat: 'Equality' },
    { op: 'in',       label: 'in (list)',      hint: 'field in ("a","b")  — matches any of these',       sym: 'in',    cat: 'List',       multi: true },
    { op: 'not_in',   label: 'not in (list)',  hint: 'field not_in ("a","b")  — none of these',          sym: '!in',   cat: 'List',       multi: true },
    { op: 'prefix',   label: 'starts with',    hint: 'field:5*  — e.g. 5* covers all 5xx codes',         sym: ':_*',   cat: 'Text',       freeText: true },
    { op: 'exists',   label: 'exists',         hint: 'field:*  — field is present',                      sym: ':*',    cat: 'Presence',   noValue: true },
  ],
  highCard: [
    { op: 'eq',       label: 'is exactly',     hint: 'field:=value  — exact match',                      sym: ':=',    cat: 'Equality' },
    { op: 'prefix',   label: 'starts with',    hint: 'field:value*  — prefix match',                     sym: ':_*',   cat: 'Text',       freeText: true },
    { op: 'regex',    label: 'matches regex',  hint: 'field:~"pattern"  — regular expression',           sym: ':~',    cat: 'Pattern',    freeText: true },
    { op: 'exists',   label: 'exists',         hint: 'field:*  — field is present',                      sym: ':*',    cat: 'Presence',   noValue: true },
  ],
}

const CATEGORY_ORDER = ['Equality', 'List', 'Text', 'Pattern', 'Presence']

function opSetFor(field) {
  const meta = FIELD_BY_NAME[field]
  if (!meta) return OPERATORS.string
  if (meta.highCard) return OPERATORS.highCard
  if (meta.type === 'keyword') return OPERATORS.keyword
  return OPERATORS.string
}

function opMetaFor(field, op) {
  return opSetFor(field).find(o => o.op === op)
}

// Renders the op+value portion of a chip using CubeAPM's canonical syntax.
// The full chip is `field` + this string.
function asArray(v) {
  if (Array.isArray(v)) return v
  if (v == null || v === '') return []
  return [v]
}

function opValueText(op, value) {
  const v = value ?? ''
  switch (op) {
    case 'exists':   return ':*'
    case 'empty':    return ':""'
    case 'word':     return `:${v}`
    case 'eq':       return `:=${v}`
    case 'neq':      return `!=${v}`
    case 'in':       return ` in (${asArray(value).map(x => `"${x}"`).join(', ')})`
    case 'not_in':   return ` not_in (${asArray(value).map(x => `"${x}"`).join(', ')})`
    case 'contains': return `:*${v}*`
    case 'prefix':   return `:${v}*`
    case 'phrase':   return `:"${v}"`
    case 'regex':    return `:~"${v}"`
    case 'nregex':   return `!~"${v}"`
    default:         return `:${v}`
  }
}

// Renders just the operator prefix for the composing chip (before user picks a value).
function opStartText(op) {
  switch (op) {
    case 'exists':   return ':*'
    case 'empty':    return ':""'
    case 'word':     return ':'
    case 'eq':       return ':='
    case 'neq':      return '!='
    case 'in':       return ' in ('
    case 'not_in':   return ' not_in ('
    case 'contains': return ':*'
    case 'prefix':   return ':'
    case 'phrase':   return ':"'
    case 'regex':    return ':~"'
    case 'nregex':   return '!~"'
    default:         return ':'
  }
}

const SAVED_QUERIES = [
  { name: 'Payments — errors last hour', chips: [
    { field: 'service',   op: 'eq', value: 'payment' },
    { field: 'log.level', op: 'eq', value: 'error' },
  ]},
  { name: 'Server errors (5xx)', chips: [
    { field: 'http.status', op: 'prefix', value: '5' },
  ]},
  { name: 'Payment path — anything matching', chips: [
    { field: 'path', op: 'contains', value: 'payment' },
  ]},
  { name: 'Connection failures', chips: [
    { field: 'log.exception.type', op: 'eq', value: 'ConnectionRefusedException' },
  ]},
  { name: 'Any exception raised', chips: [
    { field: 'log.exception.type', op: 'exists' },
  ]},
  { name: 'Payment or order services', chips: [
    { field: 'service', op: 'in', value: ['payment', 'order'] },
  ]},
  { name: 'Errors OR warnings only', chips: [
    { field: 'log.level', op: 'eq', value: 'error' },
    { field: 'log.level', op: 'eq', value: 'warn', connector: 'OR' },
  ]},
]

export function getFieldValue(log, field) {
  if (field === 'log.level') return log.level
  if (field === 'service') return log.service
  if (field === '_msg' || field === 'message') return log.message
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

// Stream selectors have their own syntax (`=`, `!=`, `=~`, `!~`) and only support
// a limited op set. When a chip qualifies, we promote it into the leading `{}` block.
const STREAM_FIELDS = new Set(['env', 'service'])

const STREAM_OP_MAP = {
  eq:     (f, v) => `${f}="${v}"`,
  neq:    (f, v) => `${f}!="${v}"`,
  in:     (f, v) => `${f} in (${asArray(v).map(x => `"${x}"`).join(', ')})`,
  not_in: (f, v) => `${f} not_in (${asArray(v).map(x => `"${x}"`).join(', ')})`,
  regex:  (f, v) => `${f}=~"${v}"`,
  nregex: (f, v) => `${f}!~"${v}"`,
}

function isStreamable(chip) {
  return STREAM_FIELDS.has(chip.field) && !!STREAM_OP_MAP[chip.op]
}

export function chipsToString(chips) {
  // Promote the longest run of AND-connected stream-eligible chips at the front.
  let splitAt = 0
  for (let i = 0; i < chips.length; i++) {
    const c = chips[i]
    if (i > 0 && c.connector === 'OR') break
    if (!isStreamable(c)) break
    splitAt = i + 1
  }
  const streams = chips.slice(0, splitAt)
  const rest = chips.slice(splitAt)

  const streamStr = streams.length > 0
    ? `{${streams.map(c => STREAM_OP_MAP[c.op](c.field, c.value)).join(', ')}}`
    : ''

  const restStr = rest.map((c, i) => {
    const chunk = `${c.field}${opValueText(c.op, c.value)}`
    if (i === 0) return chunk
    return `${c.connector === 'OR' ? 'OR' : 'AND'} ${chunk}`
  }).join(' ')

  if (streamStr && restStr) return `${streamStr} ${restStr}`
  return streamStr || restStr
}

function tokenize(s) {
  return s.toLowerCase().split(/[^a-z0-9._-]+/i).filter(Boolean)
}

function matchChip(log, c) {
  const raw = getFieldValue(log, c.field)
  const present = raw != null && raw !== ''
  if (c.op === 'exists') return present
  if (c.op === 'empty')  return !present
  if (!present) return false
  const s = String(raw)
  const sl = s.toLowerCase()
  const v = String(c.value ?? '')
  const vl = v.toLowerCase()
  switch (c.op) {
    case 'word':     return tokenize(s).includes(vl) || sl === vl
    case 'eq':       return s === v
    case 'neq':      return s !== v
    case 'in':       return asArray(c.value).map(String).includes(s)
    case 'not_in':   return !asArray(c.value).map(String).includes(s)
    case 'contains': return sl.includes(vl)
    case 'prefix':   return sl.startsWith(vl)
    case 'phrase':   return sl.includes(vl)
    case 'regex':    { try { return new RegExp(v).test(s) } catch { return false } }
    case 'nregex':   { try { return !new RegExp(v).test(s) } catch { return false } }
    default: return false
  }
}

// Evaluates chips left-to-right, respecting per-chip `connector` (default AND).
// No operator precedence — users can reorder chips to control evaluation order.
export function applyChipsToLog(log, chips) {
  if (chips.length === 0) return true
  let result = matchChip(log, chips[0])
  for (let i = 1; i < chips.length; i++) {
    const c = chips[i]
    const m = matchChip(log, c)
    if (c.connector === 'OR') result = result || m
    else result = result && m
  }
  return result
}

// ---------- Component ----------

export default function QueryBuilder({ chips, setChips, recents = [], addRecent, savedQueries = [], onRun }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  // null → field phase | { field, type, highCard } → operator phase | { …, op } → value phase
  const [composing, setComposing] = useState(null)
  const [highlight, setHighlight] = useState(0)
  // Selected values while composing a multi-value chip (in / not_in)
  const [pendingValues, setPendingValues] = useState([])
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const phase = !composing ? 'field' : composing.op == null ? 'operator' : 'value'

  const closeOverlay = useCallback(() => {
    setOpen(false)
    setHighlight(0)
  }, [])

  // Whether the value phase needs a typed value instead of a picklist
  const opMeta = composing?.op ? opMetaFor(composing.field, composing.op) : null
  const isMulti = !!opMeta?.multi
  const needsTypedValue = !!(!isMulti && (composing?.highCard || opMeta?.freeText))

  // Reset pending selections whenever we (re)enter a multi-value composing session.
  useEffect(() => {
    if (isMulti) setPendingValues([])
  }, [isMulti, composing?.field, composing?.op])

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase()

    if (phase === 'operator') {
      const ops = opSetFor(composing.field)
      const filtered = q
        ? ops.filter(o => o.op.toLowerCase().includes(q) || o.label.toLowerCase().includes(q) || o.sym.toLowerCase().includes(q))
        : ops
      // Sort by declared category order so flat (keyboard) index matches visual order.
      const sorted = [...filtered].sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.cat)
        const bi = CATEGORY_ORDER.indexOf(b.cat)
        return ai - bi
      })
      return { mode: 'operators', items: sorted }
    }

    if (phase === 'value') {
      if (isMulti) {
        const values = computeTopValues(composing.field) || []
        const filtered = q ? values.filter(v => v.value.toLowerCase().includes(q)) : values
        // Offer a "custom value" row when typed text isn't in the list yet.
        const customRow = q && !filtered.some(v => v.value.toLowerCase() === q)
          ? { value: text.trim(), count: 0, custom: true }
          : null
        return { mode: 'multi-values', items: customRow ? [customRow, ...filtered] : filtered }
      }
      if (needsTypedValue) return { mode: 'typed-value' }
      const values = computeTopValues(composing.field)
      const filtered = q ? values.filter(v => v.value.toLowerCase().includes(q)) : values
      return { mode: 'values', items: filtered }
    }

    const rec = recents
      .filter(r => !q || chipsToString(r).toLowerCase().includes(q))
      .slice(0, 5)
    // User-saved queries appear before the built-in demo set.
    const allSaved = [...savedQueries, ...SAVED_QUERIES]
    const sav = allSaved.filter(s =>
      !q || s.name.toLowerCase().includes(q) || chipsToString(s.chips).toLowerCase().includes(q)
    )
    const fac = FIELD_CATALOG.filter(f =>
      !q || f.field.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q)
    )
    return { mode: 'fields', recents: rec, saved: sav, facets: fac }
  }, [text, phase, composing, needsTypedValue, recents, savedQueries])

  const flatItems = useMemo(() => {
    if (suggestions.mode === 'fields') {
      return [
        ...suggestions.facets.map((f, i) => ({ kind: 'facet', payload: f, key: `f${i}` })),
        ...suggestions.recents.map((r, i) => ({ kind: 'recent', payload: r, key: `r${i}` })),
        ...suggestions.saved.map((s, i) => ({ kind: 'saved', payload: s, key: `s${i}` })),
      ]
    }
    if (suggestions.mode === 'operators') {
      return suggestions.items.map((o, i) => ({ kind: 'operator', payload: o, key: `o${i}` }))
    }
    if (suggestions.mode === 'values') {
      return suggestions.items.map((v, i) => ({ kind: 'value', payload: v, key: `v${i}` }))
    }
    if (suggestions.mode === 'multi-values') {
      return suggestions.items.map((v, i) => ({ kind: 'multi-value', payload: v, key: `m${i}` }))
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
    const withConnector = chips.length === 0 ? chip : { connector: 'AND', ...chip }
    setChips([...chips, withConnector])
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
    if (item.kind === 'multi-value') {
      const v = String(item.payload.value)
      setPendingValues(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
      setText('')
      inputRef.current?.focus()
      return
    }
    if (item.kind === 'recent') { applyChipSet(item.payload); return }
    if (item.kind === 'saved') { applyChipSet(item.payload.chips); return }
  }

  const commitTypedValue = () => {
    if (!composing?.op || !text.trim()) return
    commitChip({ field: composing.field, op: composing.op, value: text.trim() })
  }

  const commitMultiValues = () => {
    if (!composing?.op || pendingValues.length === 0) return
    commitChip({ field: composing.field, op: composing.op, value: pendingValues })
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
    } else if (isMulti && e.key === 'Tab') {
      // Tab commits the accumulated multi-value chip; Shift+Tab clears the last pending.
      e.preventDefault()
      if (e.shiftKey && pendingValues.length) setPendingValues(pendingValues.slice(0, -1))
      else if (pendingValues.length) commitMultiValues()
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
    const next = chips.filter((_, i) => i !== idx)
    // If we removed the first chip, strip the connector from the new first chip.
    if (next.length > 0 && next[0].connector) {
      next[0] = { ...next[0], connector: undefined }
    }
    setChips(next)
    inputRef.current?.focus()
  }

  const toggleConnector = (idx) => {
    if (idx <= 0 || idx >= chips.length) return
    const next = [...chips]
    next[idx] = { ...next[idx], connector: next[idx].connector === 'OR' ? 'AND' : 'OR' }
    setChips(next)
  }

  const typedValuePlaceholder = (op, field) => {
    switch (op) {
      case 'regex':    return `Regex pattern for ${field} (e.g. ^error.*)`
      case 'nregex':   return `Regex to exclude on ${field} (e.g. ^info)`
      case 'contains': return `Substring to match anywhere in ${field}…`
      case 'prefix':   return `Prefix for ${field} (e.g. pay matches payment, payer)`
      case 'phrase':   return `Phrase in ${field} — multi-word exact (quotes auto)`
      default:         return `Type a value for ${field}…`
    }
  }

  const placeholder = phase === 'operator'
    ? `Choose an operator for ${composing.field}…`
    : phase === 'value'
      ? (isMulti
          ? `Pick values — Tab to commit ${pendingValues.length ? `(${pendingValues.length} selected)` : ''}`
          : needsTypedValue
            ? typedValuePlaceholder(composing.op, composing.field)
            : `Search values for ${composing.field}…`)
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
          <Fragment key={`chip${i}`}>
            {i > 0 && (
              <button
                type="button"
                className={`qb-connector${c.connector === 'OR' ? ' or' : ''}`}
                onClick={(e) => { e.stopPropagation(); toggleConnector(i) }}
                title={`Boolean connector — click to toggle (currently ${c.connector === 'OR' ? 'OR' : 'AND'})`}
                aria-label={`Toggle connector — currently ${c.connector === 'OR' ? 'OR' : 'AND'}`}
              >
                {c.connector === 'OR' ? 'OR' : 'AND'}
              </button>
            )}
            <span className="qb-chip">
              <span className="qb-chip-field">{c.field}</span>
              <span className="qb-chip-opval">{opValueText(c.op, c.value)}</span>
              <button
                type="button"
                className="qb-chip-x"
                onClick={(e) => removeChip(i, e)}
                aria-label={`Remove filter ${c.field}${opValueText(c.op, c.value)}`}
                title="Remove filter"
              >×</button>
            </span>
          </Fragment>
        ))}

        {composing && (
          <span className="qb-composing" aria-live="polite">
            <span className="qb-composing-field">{composing.field}</span>
            {composing.op != null && <span className="qb-composing-op">{opStartText(composing.op)}</span>}
            {isMulti && pendingValues.length > 0 && (
              <span className="qb-composing-op">{pendingValues.map(v => `"${v}"`).join(', ')})</span>
            )}
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
                <Section label="Top Facets / Keys" meta="Indexed">
                  {suggestions.facets.length === 0 ? (
                    <Empty>No fields match "{text}"</Empty>
                  ) : suggestions.facets.map((f, i) => {
                    const idx = flatItems.findIndex(x => x.key === `f${i}`)
                    return (
                      <Row key={`f${i}`} icon={f.type === 'keyword' ? '#' : 'A'} active={idx === highlight}
                        onHover={() => setHighlight(idx)} onPick={() => commitItem(flatItems[idx])}
                        label={<>
                          <span className="mono">{f.field}</span>
                          <span className="qb-ov-meta">{f.highCard ? 'high cardinality' : f.desc}</span>
                        </>}
                        meta={<span className="qb-ov-type">{f.type}</span>} />
                    )
                  })}
                </Section>

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
              </>
            )}

            {suggestions.mode === 'operators' && (() => {
              // Group ops by category, preserving the flat index for keyboard nav
              const grouped = CATEGORY_ORDER
                .map(cat => ({ cat, ops: suggestions.items.filter(o => o.cat === cat) }))
                .filter(g => g.ops.length > 0)
              return (
                <div className="qb-ov-ops-wrap">
                  <div className="qb-ov-header">
                    <span className="qb-ov-lbl">Operators for {composing.field}</span>
                    <span className="qb-ov-lbl-meta">
                      {composing.highCard ? 'high-cardinality field' : `${composing.type} field`}
                    </span>
                  </div>
                  {grouped.map(({ cat, ops }) => (
                    <div key={cat} className="qb-ov-subsection">
                      <div className="qb-ov-subhead">{cat}</div>
                      {ops.map(o => {
                        const flatIdx = suggestions.items.indexOf(o)
                        const idx = flatItems.findIndex(x => x.key === `o${flatIdx}`)
                        return (
                          <Row key={`o${flatIdx}`}
                            icon={<span className="qb-ov-opsym">{o.sym}</span>}
                            active={idx === highlight}
                            onHover={() => setHighlight(idx)}
                            onPick={() => commitItem(flatItems[idx])}
                            label={<>
                              <span className="qb-ov-name">{o.label}</span>
                              <span className="qb-ov-meta mono">{o.hint}</span>
                            </>} />
                        )
                      })}
                    </div>
                  ))}
                </div>
              )
            })()}

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

            {suggestions.mode === 'multi-values' && (
              <Section
                label={`Values for ${composing.field} ${composing.op === 'in' ? '(in)' : '(not in)'}`}
                meta={`${pendingValues.length} selected`}
              >
                {suggestions.items.length === 0 ? (
                  <Empty>No values match "{text}".</Empty>
                ) : suggestions.items.map((v, i) => {
                  const idx = flatItems.findIndex(x => x.key === `m${i}`)
                  const checked = pendingValues.includes(String(v.value))
                  return (
                    <Row key={`m${i}`}
                      icon={<span className={`qb-mv-check${checked ? ' on' : ''}`}>{checked ? '✓' : ''}</span>}
                      active={idx === highlight}
                      onHover={() => setHighlight(idx)}
                      onPick={() => commitItem(flatItems[idx])}
                      label={<>
                        <span className="mono">{v.value}</span>
                        {v.custom && <span className="qb-ov-meta">custom value</span>}
                      </>}
                      meta={v.custom ? null : <span className="mono">{v.count.toLocaleString()} logs</span>} />
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
                      : composing.op === 'regex' || composing.op === 'nregex'
                        ? <>Type a regular expression to match against <span className="mono">{composing.field}</span>.</>
                        : composing.op === 'phrase'
                          ? <>Type the phrase to match inside <span className="mono">{composing.field}</span>. Quotes are added automatically.</>
                          : <>Type the text to match against <span className="mono">{composing.field}</span>.</>}
                  </p>
                  <button type="button" className="qb-hc-commit" disabled={!text.trim()} onClick={commitTypedValue}>
                    {text.trim()
                      ? `Add filter ${composing.field}${opValueText(composing.op, text.trim())}`
                      : 'Add filter'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {suggestions.mode === 'multi-values' && (
            <div className="qb-mv-foot">
              <span className="qb-mv-count">{pendingValues.length} selected</span>
              <button
                type="button"
                className="qb-hc-commit qb-mv-commit"
                disabled={pendingValues.length === 0}
                onClick={commitMultiValues}
              >
                {pendingValues.length === 0
                  ? 'Pick one or more values'
                  : `Add ${composing.field}${opValueText(composing.op, pendingValues)}`}
              </button>
            </div>
          )}

          <div className="qb-ov-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            {isMulti
              ? <><span><kbd>↵</kbd> Toggle</span><span><kbd>Tab</kbd> Commit</span></>
              : <><span><kbd>Tab</kbd> Insert &amp; continue</span><span><kbd>↵</kbd> Commit</span></>}
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

import { Fragment, useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { AlertCircle } from 'lucide-react'
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

// Splits the op+value tail into separately addressable pieces, so each part of a
// chip can be clicked to edit just that part. The punctuation (prefix/suffix) is
// the operator; whatever sits between them is the value.
function chipSegments(op, value) {
  const v = String(value ?? '')
  const list = () => asArray(value).map(x => `"${x}"`).join(', ')
  switch (op) {
    case 'exists':   return { prefix: ':*',       value: '',      suffix: '' }
    case 'empty':    return { prefix: ':""',      value: '',      suffix: '' }
    case 'word':     return { prefix: ':',        value: v,       suffix: '' }
    case 'eq':       return { prefix: ':=',       value: v,       suffix: '' }
    case 'neq':      return { prefix: '!=',       value: v,       suffix: '' }
    case 'in':       return { prefix: ' in (',    value: list(),  suffix: ')' }
    case 'not_in':   return { prefix: ' not_in (', value: list(), suffix: ')' }
    case 'contains': return { prefix: ':*',       value: v,       suffix: '*' }
    case 'prefix':   return { prefix: ':',        value: v,       suffix: '*' }
    case 'phrase':   return { prefix: ':"',       value: v,       suffix: '"' }
    case 'regex':    return { prefix: ':~"',      value: v,       suffix: '"' }
    case 'nregex':   return { prefix: '!~"',      value: v,       suffix: '"' }
    default:         return { prefix: ':',        value: v,       suffix: '' }
  }
}

// Canonical CubeAPM syntax for a chip's tail — derived from the segments so the
// rendered chip and the generated query can never drift apart.
function opValueText(op, value) {
  const s = chipSegments(op, value)
  return s.prefix + s.value + s.suffix
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

export default function QueryBuilder({ chips, setChips, recents = [], addRecent, savedQueries = [], onRun, onComposingChange, leading }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  // null → field phase | { field, type, highCard } → operator phase | { …, op } → value phase
  const [composing, setComposing] = useState(null)
  const [highlight, setHighlight] = useState(0)
  // Selected values while composing a multi-value chip (in / not_in)
  const [pendingValues, setPendingValues] = useState([])
  // Index of the chip being re-opened for editing, or null when composing a new
  // one. The chip itself stays in `chips` the whole time — this only redirects
  // rendering and the eventual commit — so abandoning an edit reverts for free.
  const [editingIndex, setEditingIndex] = useState(null)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const phase = !composing ? 'field' : composing.op == null ? 'operator' : 'value'
  const isEditing = editingIndex != null

  const closeOverlay = useCallback(() => {
    setOpen(false)
    setHighlight(0)
    // Dropping out of an edit discards the in-progress changes and restores the
    // original chip. A new-chip trip keeps its composing state instead, so it can
    // surface the "unfinished filter" error.
    setEditingIndex(prev => {
      if (prev != null) { setComposing(null); setText('') }
      return null
    })
  }, [])

  // Whether the value phase needs a typed value instead of a picklist
  const opMeta = composing?.op ? opMetaFor(composing.field, composing.op) : null
  const isMulti = !!opMeta?.multi
  const needsTypedValue = !!(!isMulti && (composing?.highCard || opMeta?.freeText))

  // Reset pending selections whenever we (re)enter a multi-value composing session.
  // Editing is exempt: beginEdit seeds pendingValues from the chip being edited,
  // and this would immediately wipe that seed.
  useEffect(() => {
    if (isMulti && !isEditing) setPendingValues([])
  }, [isMulti, isEditing, composing?.field, composing?.op])

  // Surface "there's an uncommitted filter in progress" upward so the parent can
  // reflect it on the Run button. A trip is incomplete until it commits to a chip
  // (composing → null) or is cancelled. Always clear on unmount (e.g. switching
  // away from builder mode) so a stale signal doesn't linger.
  // Only a *new* half-built chip blocks Run. An in-flight edit doesn't: the
  // original chip is still in `chips` and still valid, so the query is runnable.
  useEffect(() => { onComposingChange?.(!!composing && !isEditing) }, [composing, isEditing, onComposingChange])
  useEffect(() => () => onComposingChange?.(false), [onComposingChange])

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
    // Anything typed can also be searched against the log body instead — including
    // a string that happens to spell a field name, since "service" is a plausible
    // thing to grep the message for. When no field matches, that's the only sensible
    // reading of the input, so the row leads the list and Enter takes it by default;
    // otherwise it sits behind the field matches as a deliberate second choice.
    const typed = text.trim()
    const freeText = typed || null
    return { mode: 'fields', recents: rec, saved: sav, facets: fac, freeText, freeTextFirst: fac.length === 0 }
  }, [text, phase, composing, needsTypedValue, recents, savedQueries])

  const flatItems = useMemo(() => {
    if (suggestions.mode === 'fields') {
      // Mirrors the section order rendered below — keyboard index must track it.
      const ft = suggestions.freeText ? [{ kind: 'freetext', payload: suggestions.freeText, key: 'ft' }] : []
      const fac = suggestions.facets.map((f, i) => ({ kind: 'facet', payload: f, key: `f${i}` }))
      return [
        ...(suggestions.freeTextFirst ? ft : fac),
        ...(suggestions.freeTextFirst ? fac : ft),
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
    setEditingIndex(null)
    setText('')
    closeOverlay()
    addRecent?.(nextChips)
  }

  // Re-opens an existing chip for editing, at whichever part was clicked:
  // 'field' re-picks the whole thing, 'operator' keeps the field, 'value' keeps
  // both. Backspace still steps back from wherever you land.
  const beginEdit = (i, target, e) => {
    e?.stopPropagation()
    const c = chips[i]
    if (!c) return
    const meta = FIELD_BY_NAME[c.field]
    const om = opMetaFor(c.field, c.op)
    setEditingIndex(i)
    setHighlight(0)
    setOpen(true)

    if (target === 'field') {
      // Nothing survives a field change — the old operator and value belong to
      // the old field, so start the trip from scratch.
      setComposing(null)
      setPendingValues([])
      setText('')
    } else if (target === 'operator') {
      setComposing({ field: c.field, type: meta?.type ?? 'string', highCard: !!meta?.highCard })
      // Carry the value across so switching e.g. `is exactly` → `in (list)`
      // keeps what was already there instead of starting empty.
      setPendingValues(asArray(c.value).map(String))
      setText('')
    } else {
      setComposing({ field: c.field, type: meta?.type ?? 'string', highCard: !!meta?.highCard, op: c.op })
      setPendingValues(om?.multi ? asArray(c.value).map(String) : [])
      // Seed the input only where the value is typed rather than picked; a picklist
      // wants an unfiltered list, not one pre-narrowed to the current value.
      const typedSeed = !om?.multi && (meta?.highCard || om?.freeText)
      setText(typedSeed ? String(c.value ?? '') : '')
    }
    inputRef.current?.focus()
  }

  const commitChip = (chip) => {
    if (isEditing) {
      const next = [...chips]
      // Preserve the connector — editing a filter's content shouldn't silently
      // change how it joins to its neighbours.
      next[editingIndex] = { ...chip, connector: chips[editingIndex]?.connector }
      setChips(next)
      setComposing(null)
      setEditingIndex(null)
      setText('')
      inputRef.current?.focus()
      return
    }
    const withConnector = chips.length === 0 ? chip : { connector: 'AND', ...chip }
    setChips([...chips, withConnector])
    setComposing(null)
    setText('')
    inputRef.current?.focus()
  }

  const commitItem = (item) => {
    if (!item) return
    // Free text commits straight to a chip — no operator/value phases, since the
    // field (_msg) and operator (contains) are both implied by the intent.
    if (item.kind === 'freetext') {
      commitChip({ field: '_msg', op: 'contains', value: item.payload })
      return
    }
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

  // Abandon the in-progress trip entirely (the composing chip's × button).
  const cancelComposing = useCallback(() => {
    setComposing(null)
    setEditingIndex(null)
    setText('')
    setPendingValues([])
  }, [])

  const stepBack = () => {
    if (!composing) {
      if (chips.length) setChips(chips.slice(0, -1))
      return
    }
    if (composing.op != null) setComposing({ ...composing, op: undefined })
    // Stepping past the field ends the trip; for an edit that means abandoning
    // it, which restores the untouched original.
    else { setComposing(null); setEditingIndex(null) }
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

  // Resets the whole bar, not just the committed chips — leaving a half-built
  // filter or stray text behind after "clear everything" would be surprising.
  const clearAll = (e) => {
    e?.stopPropagation()
    setChips([])
    setComposing(null)
    setEditingIndex(null)
    setPendingValues([])
    setText('')
    inputRef.current?.focus()
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
            : isEditing
              ? `Pick a new value for ${composing.field} — Esc to cancel`
              : `Search values for ${composing.field}…`)
      : isEditing
        ? 'Pick a replacement field — Esc to cancel'
        : chips.length
          ? 'Add another filter'
          : 'Type a field name (e.g. service, duration_ms) or free text'

  // Rendered either above or below the facet list depending on freeTextFirst, so
  // it's built once here rather than duplicated at both call sites.
  const freeTextSection = suggestions.mode === 'fields' && suggestions.freeText ? (() => {
    const idx = flatItems.findIndex(x => x.key === 'ft')
    return (
      <Section label="Free Text Search" meta="Log message">
        <Row icon="⌕" active={idx === highlight}
          onHover={() => setHighlight(idx)} onPick={() => commitItem(flatItems[idx])}
          label={<>
            <span className="qb-ov-name">Search logs for “{suggestions.freeText}”</span>
            <span className="qb-ov-preview mono">_msg:*{suggestions.freeText}*</span>
          </>} />
      </Section>
    )
  })() : null

  // A trip is "abandoned" when it's still composing but the overlay has closed
  // (blur, Run, click-away) without being committed as a chip. That's the point
  // we flip the composing chip from in-progress blue to error red and explain
  // what's missing. While the overlay is open we treat it as in-progress and
  // stay quiet — no nagging mid-build.
  const composingAbandoned = !!composing && !open
  const incompleteMessage = !composingAbandoned
    ? null
    : composing.op == null
      ? `Unfinished filter — choose an operator for “${composing.field}”, or remove it.`
      : isMulti
        ? `Unfinished filter — pick at least one value for “${composing.field}”, or remove it.`
        : `Unfinished filter — add a value for “${composing.field}”, or remove it.`

  // The in-progress chip. Renders at the end of the row for a new filter, or in
  // the edited chip's own slot so the query keeps its reading order while editing.
  const composingChip = composing ? (
    <span className={`qb-composing${composingAbandoned ? ' is-error' : ''}${isEditing ? ' is-editing' : ''}`} aria-live="polite">
      <span className="qb-composing-field">{composing.field}</span>
      {composing.op != null && <span className="qb-composing-op">{opStartText(composing.op)}</span>}
      {isMulti && pendingValues.length > 0 && (
        <span className="qb-composing-op">{pendingValues.map(v => `"${v}"`).join(', ')})</span>
      )}
      <button
        type="button"
        className="qb-composing-x"
        onClick={(e) => { e.stopPropagation(); cancelComposing() }}
        onMouseDown={(e) => e.preventDefault()}
        aria-label={isEditing ? `Cancel editing ${composing.field}` : `Remove unfinished filter ${composing.field}`}
        title={isEditing ? 'Cancel edit' : 'Remove unfinished filter'}
      >×</button>
    </span>
  ) : null

  return (
    <div className="qb-wrap" ref={wrapRef}>
      <div className="qb-input-row" onClick={() => inputRef.current?.focus()}>
        {/* Leading slot — the mode toggle lives here in place of the magnifier.
            Falls back to the icon when no toggle is supplied. */}
        {leading ?? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
        )}

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
            {editingIndex === i ? (composingChip ?? (
              // Field phase of an edit: no composing chip exists yet, so show the
              // original in the editing style — the slot keeps its place and the
              // × still cancels back to it.
              <span className="qb-chip is-editing">
                <span className="qb-chip-field">{c.field}</span>
                <span className="qb-chip-opval">{opValueText(c.op, c.value)}</span>
                <button
                  type="button"
                  className="qb-chip-x"
                  onClick={(e) => { e.stopPropagation(); cancelComposing() }}
                  onMouseDown={(e) => e.preventDefault()}
                  title="Cancel edit"
                  aria-label={`Cancel editing ${c.field}`}
                >×</button>
              </span>
            )) : (() => {
              const seg = chipSegments(c.op, c.value)
              const full = `${c.field}${opValueText(c.op, c.value)}`
              const opBtn = (key) => (
                <button
                  key={key}
                  type="button"
                  className="qb-chip-seg qb-chip-op"
                  onClick={(e) => beginEdit(i, 'operator', e)}
                  onMouseDown={(e) => e.preventDefault()}
                  title="Click to change the operator"
                  aria-label={`Change operator for ${full}`}
                >{key === 'pre' ? seg.prefix : seg.suffix}</button>
              )
              return (
                <span className="qb-chip">
                  <button
                    type="button"
                    className="qb-chip-seg qb-chip-field"
                    onClick={(e) => beginEdit(i, 'field', e)}
                    onMouseDown={(e) => e.preventDefault()}
                    title="Click to change the field"
                    aria-label={`Change field for ${full}`}
                  >{c.field}</button>
                  {opBtn('pre')}
                  {seg.value && (
                    <button
                      type="button"
                      className="qb-chip-seg qb-chip-val"
                      onClick={(e) => beginEdit(i, 'value', e)}
                      onMouseDown={(e) => e.preventDefault()}
                      title="Click to change the value"
                      aria-label={`Change value for ${full}`}
                    >{seg.value}</button>
                  )}
                  {seg.suffix && opBtn('suf')}
                  <button
                    type="button"
                    className="qb-chip-x"
                    onClick={(e) => removeChip(i, e)}
                    aria-label={`Remove filter ${full}`}
                    title="Remove filter"
                  >×</button>
                </span>
              )
            })()}
          </Fragment>
        ))}

        {!isEditing && composingChip}

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

        {chips.length > 0 && (
          <button
            type="button"
            className="qb-clear-all"
            onClick={clearAll}
            onMouseDown={(e) => e.preventDefault()}
            title="Clear all filters"
            aria-label="Clear all filters"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {incompleteMessage && (
        <div className="qb-composing-error" role="alert">
          <AlertCircle size={12} strokeWidth={2} />
          <span>{incompleteMessage}</span>
        </div>
      )}

      {open && (
        // stopPropagation here keeps a click on an overlay row from reaching the
        // document-level outside-click handler. Without it, a row that re-renders
        // out of existence on click (facet → operators) is seen as a detached
        // target "outside" the wrap, which wrongly closed the overlay and broke
        // the field → operator → value flow.
        <div className="qb-overlay" role="listbox" onMouseDown={(e) => e.stopPropagation()}>
          <div ref={listRef} className="qb-overlay-scroll">

            {suggestions.mode === 'fields' && (
              <>
                {suggestions.freeTextFirst && freeTextSection}
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

                {!suggestions.freeTextFirst && freeTextSection}

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

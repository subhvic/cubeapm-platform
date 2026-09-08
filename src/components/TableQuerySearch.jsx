// The query variant of table search: several fields, a small query language,
// syntax colouring, and an overlay that teaches the operators.
//
// Its counterpart is TableSearch, which filters one field with plain text and
// nothing else. Pick by how many fields the table can be searched on: one field
// needs no syntax, and giving it any would be ceremony.
//
// Two behaviours worth knowing before changing anything here.
//
// Plain text filters as you type; a query does not. The moment the text stops
// being ordinary words — a field, a bracket, an operator — results wait for a
// run, because a half-typed `pod:(a OR` would otherwise empty the table under
// the person writing it. The run button appears exactly when that switch flips.
//
// Errors are only shown after a run has been attempted, for the same reason:
// every query is malformed while it is half-written, and saying so on each
// keystroke is nagging rather than help.

import { useState, useRef, useEffect } from 'react'
import { CornerDownLeft } from 'lucide-react'
import { parsePodQuery, segmentQuery, isPlainQuery, POD_FIELDS } from '@/utils/tableQuery'

export default function TableQuerySearch({ onApply, placeholder, fields = POD_FIELDS }) {
  const [draft, setDraft] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [open, setOpen] = useState(false)
  // The text behind the results on screen. null while a query is written but
  // not yet run, which is also the state that shows the run button.
  const [applied, setApplied] = useState('')
  // Index into `rows` below. Clamped rather than wrapping, matching the logs
  // suggestion overlay so the two behave the same under the same keys.
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const inkRef = useRef(null)
  const wasPlain = useRef(true)

  const typed = draft.trim()
  const plain = isPlainQuery(draft)
  const parsed = parsePodQuery(draft, fields)
  // Offered only while the text differs from what the table is showing: after a
  // run there is nothing left to run, until the query is edited again.
  const needsRun = !plain && typed.length > 0 && applied !== draft
  const error = attempted && !parsed.ok ? parsed.error : null

  // The overlay is a ground state: it explains what the field can do before
  // there is anything to explain about. Once typing starts it would only cover
  // the rows the person is trying to watch.
  const showOverlay = open && typed.length === 0
  const first = fields[0]?.name ?? 'field'
  const second = fields[1]?.name ?? fields[0]?.name ?? 'field'

  // The overlay's rows, in the order they render — the keyboard index and the
  // markup read the same list so they can never disagree.
  const rows = [
    { key: 'text', main: 'text', hint: `Plain text searches ${fields.length === 2 ? 'both fields' : 'every field'}` },
    ...fields.map(f => ({ key: f.name, main: `${f.name}:`, hint: `Search ${f.name} only`, field: f.name })),
  ]

  // Picking the plain-text row inserts nothing: it is a statement that typing
  // is already all this field needs, so it steps out of the way.
  const pick = (row) => {
    if (row.field) change(`${row.field}:`)
    else setOpen(false)
    inputRef.current?.focus()
  }

  // Plain text is applied as it is typed. Writing a query is a different mode,
  // so crossing into it drops the plain-text filter and puts the unfiltered
  // table back — the rows underneath should not go on answering a search the
  // person has stopped writing.
  useEffect(() => {
    if (plain) {
      setAttempted(false)
      setApplied(draft)
      onApply(draft)
    } else if (wasPlain.current) {
      setApplied(null)
      onApply('')
    }
    wasPlain.current = plain
  }, [draft, plain])   // eslint-disable-line react-hooks/exhaustive-deps

  const run = () => {
    setAttempted(true)
    const next = parsePodQuery(draft, fields)
    if (!next.ok) return
    setApplied(draft)
    onApply(draft)
  }

  const change = (text) => {
    setDraft(text)
    // A fresh edit is a fresh attempt: the previous complaint described text
    // that no longer exists.
    if (attempted) setAttempted(false)
  }

  const clear = () => {
    setDraft('')
    setAttempted(false)
    setApplied('')
    onApply('')
    inputRef.current?.focus()
  }

  // Keyed on the overlay being shown rather than on focus: clearing the field
  // brings it back with no focus event, and a stale highlight would then have
  // Enter pick whatever was chosen last time.
  useEffect(() => {
    if (showOverlay) setHighlight(0)
  }, [showOverlay])

  useEffect(() => {
    if (!open) return
    const onDocDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  // The ink layer does not scroll itself, so it follows the input's scroll to
  // stay aligned once the text is longer than the field.
  const syncScroll = () => {
    if (inkRef.current && inputRef.current) {
      inkRef.current.scrollLeft = inputRef.current.scrollLeft
    }
  }

  return (
    <div className="pod-search-wrap" ref={wrapRef}>
      <div className={`svc-search pod-search-field${error ? ' has-error' : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>

        {/* The input carries the caret and the selection; the layer beneath
            carries the colour. Both must keep identical metrics or the two
            copies of the text drift apart. */}
        <div className="pod-search-ink-wrap">
          <div className="pod-search-ink" ref={inkRef} aria-hidden="true">
            {segmentQuery(draft, fields).map((seg, i) => (
              <span key={i} className={`pod-ink-${seg.type}`}>{seg.text}</span>
            ))}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={e => change(e.target.value)}
            onFocus={() => setOpen(true)}
            onScroll={syncScroll}
            onKeyDown={e => {
              if (showOverlay && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault()
                setHighlight(h => e.key === 'ArrowDown'
                  ? Math.min(h + 1, rows.length - 1)
                  : Math.max(h - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                // While the overlay is up there is no query to run — it only
                // shows on an empty field — so Enter belongs to the highlight.
                if (showOverlay) pick(rows[highlight])
                else { setOpen(false); run() }
              } else if (e.key === 'Escape') {
                if (showOverlay) setOpen(false); else clear()
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        {needsRun && (
          <button type="button" className="pod-search-run" onClick={run} title="Run this query (Enter)" aria-label="Run this query">
            <CornerDownLeft strokeWidth={2.5} />
          </button>
        )}
        {typed && (
          <button type="button" className="svc-search-clear" onClick={clear} title="Clear search" aria-label="Clear search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {error && <div className="pod-search-error" role="alert">{error}</div>}

      {showOverlay && (
        <div className="pod-search-overlay">
          <div className="pod-search-section" role="listbox" aria-label="Search options">
            {rows.map((row, i) => (
              <button
                key={row.key}
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={`pod-search-row${i === highlight ? ' hl' : ''}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={e => { e.preventDefault(); pick(row) }}
              >
                <span className="pod-search-row-main mono">{row.main}</span>
                <span className="pod-search-row-hint">{row.hint}</span>
              </button>
            ))}
          </div>

          {/* Examples are written in this table's own field names, so the
              legend is never demonstrating a field the table does not have. */}
          <div className="pod-search-legend">
            <span className="pod-search-legend-item">
              <span className="pod-search-legend-lbl">Union</span>
              <code>{first}:(a OR b)</code>
            </span>
            <span className="pod-search-legend-item">
              <span className="pod-search-legend-lbl">Combine</span>
              <code>{first}:a AND {second}:b</code>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

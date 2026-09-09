// The query variant of table search: several fields, a small query language,
// and syntax colouring.
//
// The syntax is discoverable from the placeholder's worked example rather than
// from a suggestion overlay — the field is one line of text, and a panel that
// covered the rows being filtered cost more than it taught.
//
// Its counterpart is TableSearch, which filters one field with plain text and
// nothing else. Pick by how many fields the table can be searched on: one field
// needs no syntax, and giving it any would be ceremony.
//
// The table follows the text as it is typed, queries included — there is
// nothing to press. Two things keep that from turning into noise while a query
// is still being written.
//
// A query that does not parse is never applied: the rows go on answering the
// last text that did, instead of emptying under the person mid-`pod:(a OR`.
//
// The error waits for a pause in typing. Every query is malformed on the way to
// being written — `pod:` is a stop on the road to `pod:redis` — so complaining
// on each keystroke would be nagging rather than help. Enter asks for the
// verdict now instead of waiting.
//
// It then arrives in two strengths. A squiggle marks the characters at fault,
// quietly, the way an editor does. The sentence explaining it is held back
// while the caret is still in a query that merely ran out: someone who has
// typed `pod:` is deciding what to search for, not making a mistake, and does
// not need telling. Leaving the field ends that grace — the query is as
// finished as it is going to get, so it is worth saying what is wrong with it.

import { useState, useRef, useEffect } from 'react'
import { parsePodQuery, segmentQuery, placeholderFor, POD_FIELDS } from '@/utils/tableQuery'

// Long enough to type a colon and keep going, short enough that a query that
// will never work does not sit there unexplained.
const SETTLE_MS = 500

export default function TableQuerySearch({ onApply, fields = POD_FIELDS }) {
  const [draft, setDraft] = useState('')
  // Whether typing has paused. Nothing is said about a broken query until it has.
  const [settled, setSettled] = useState(true)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const inkRef = useRef(null)

  const placeholder = placeholderFor(fields)
  const typed = draft.trim()
  const parsed = parsePodQuery(draft, fields)
  const error = settled && !parsed.ok ? parsed.error : null
  // A query still being composed keeps its explanation to itself until the
  // caret leaves. One that is wrong rather than unfinished says so straight away.
  const message = error && (!parsed.incomplete || !focused) ? error : null

  useEffect(() => {
    if (parsed.ok) onApply(draft)
  }, [draft, parsed.ok])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (parsed.ok) { setSettled(true); return }
    setSettled(false)
    const t = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(t)
  }, [draft, parsed.ok])

  const clear = () => {
    setDraft('')
    setSettled(true)
    inputRef.current?.focus()
  }

  // The ink layer does not scroll itself, so it follows the input's scroll to
  // stay aligned once the text is longer than the field.
  const syncScroll = () => {
    if (inkRef.current && inputRef.current) {
      inkRef.current.scrollLeft = inputRef.current.scrollLeft
    }
  }

  return (
    <div className="pod-search-wrap">
      <div className="svc-search pod-search-field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>

        {/* The input carries the caret and the selection; the layer beneath
            carries the colour. Both must keep identical metrics or the two
            copies of the text drift apart. */}
        <div className="pod-search-ink-wrap">
          <div className="pod-search-ink" ref={inkRef} aria-hidden="true">
            {segmentQuery(draft, fields, error ? parsed.span : null).map((seg, i) => (
              <span key={i} className={`pod-ink-${seg.type}${seg.bad ? ' pod-ink-bad' : ''}`}>{seg.text}</span>
            ))}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onScroll={syncScroll}
            onFocus={() => setFocused(true)}
            // Leaving is as final as the query gets: stop waiting on both counts.
            onBlur={() => { setFocused(false); setSettled(true) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); setSettled(true) }
              else if (e.key === 'Escape') clear()
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        {typed && (
          <button type="button" className="svc-search-clear" onClick={clear} title="Clear search" aria-label="Clear search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {message && <div className="pod-search-error" role="alert">{message}</div>}

    </div>
  )
}

// The plain variant of table search: one field, text, nothing to learn.
//
// Its counterpart is TableQuerySearch, which adds a field syntax and operators.
// Pick by how many fields the table can be searched on — a single-field table
// has nothing to disambiguate, so a query language there would be ceremony
// around a substring match.
//
// Both variants share the `.svc-search` shell, so a table gains or loses the
// syntax without the field itself changing shape.

import { useRef } from 'react'

export default function TableSearch({ value, onChange, placeholder }) {
  const inputRef = useRef(null)
  const typed = value.trim()

  return (
    <div className="svc-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onChange('') }}
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      {typed && (
        <button
          type="button"
          className="svc-search-clear"
          onClick={() => { onChange(''); inputRef.current?.focus() }}
          title="Clear search"
          aria-label="Clear search"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  )
}

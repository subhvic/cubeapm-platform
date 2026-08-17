import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import { suggestRaw } from '@/utils/rawQuery'

const KIND_BADGE = {
  field: 'A',
  operator: ':',
  value: '=',
  pipe: '|',
  function: 'ƒ',
  keyword: '&',
}

const KIND_LABEL = {
  field: 'Fields',
  operator: 'Operators',
  value: 'Values',
  pipe: 'Pipes',
  function: 'Functions',
  keyword: 'Keywords',
}

// Raw CubeAPM query editor. A textarea rather than an input so long queries
// wrap instead of scrolling sideways, auto-growing to fit its content.
//
// Completion is caret-aware: suggestRaw inspects the text left of the caret to
// decide whether we're naming a field, choosing an operator, filling a value,
// or partway through a pipe stage, and returns the span to replace. The menu is
// anchored under the whole box rather than the caret — simpler, and matches how
// other query bars in the app behave.
export default function RawQueryInput({
  value,
  onChange,
  onSubmit,
  error,
  leading,
  placeholder = 'e.g. {env="prod"} log.level:=error | stats by ("service") count()',
}) {
  const [open, setOpen] = useState(false)
  const [caret, setCaret] = useState(0)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)
  const taRef = useRef(null)
  const listRef = useRef(null)

  const { items, from, to } = useMemo(
    () => (open ? suggestRaw(value, caret) : { items: [], from: 0, to: 0 }),
    [open, value, caret]
  )

  // Grow the textarea to fit, so a long query is fully visible.
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [value])

  useEffect(() => { setHighlight(0) }, [items.length, from])

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.querySelectorAll('.rawq-item')[highlight]?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const syncCaret = useCallback(() => {
    const ta = taRef.current
    if (ta) setCaret(ta.selectionStart ?? 0)
  }, [])

  const apply = useCallback((item) => {
    if (!item) return
    // `replaceWith` rewrites the whole token (field + operator + value cases);
    // otherwise the item's own value is spliced into the suggested span.
    const insert = item.replaceWith ?? item.value
    const next = value.slice(0, from) + insert + value.slice(to)
    const nextCaret = from + insert.length
    onChange(next)
    setOpen(true)
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(nextCaret, nextCaret)
      setCaret(nextCaret)
    })
  }, [value, from, to, onChange])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false) }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter takes the highlighted completion when the menu is open and has
      // something to offer; otherwise it runs the query.
      if (open && items.length > 0) { e.preventDefault(); apply(items[highlight]); return }
      e.preventDefault()
      setOpen(false)
      onSubmit?.()
      return
    }
    if (!open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % Math.max(items.length, 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + items.length) % Math.max(items.length, 1)) }
    else if (e.key === 'Tab' && items.length > 0) { e.preventDefault(); apply(items[highlight]) }
  }

  // Group consecutive items by kind so the menu reads as sections.
  const groups = useMemo(() => {
    const out = []
    items.forEach((it, i) => {
      const kind = it.kind || 'value'
      const last = out[out.length - 1]
      if (last && last.kind === kind) last.items.push({ ...it, index: i })
      else out.push({ kind, items: [{ ...it, index: i }] })
    })
    return out
  }, [items])

  return (
    <div className="rawq-wrap" ref={wrapRef}>
      <div className={clsx('rawq-row', { 'is-error': !!error })} onClick={() => taRef.current?.focus()}>
        {leading}
        <textarea
          ref={taRef}
          className="rawq-input"
          value={value}
          rows={1}
          spellCheck={false}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(e) => { onChange(e.target.value); setCaret(e.target.selectionStart ?? 0); setOpen(true) }}
          onKeyUp={syncCaret}
          onClick={(e) => { e.stopPropagation(); syncCaret() }}
          onFocus={() => { syncCaret(); setOpen(true) }}
          onKeyDown={onKeyDown}
        />
      </div>

      {error && (
        <div className="rawq-error" role="alert">
          <AlertCircle size={12} strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      {open && items.length > 0 && (
        <div className="rawq-menu" ref={listRef} role="listbox">
          {groups.map((g, gi) => (
            <div key={`${g.kind}${gi}`} className="rawq-group">
              <div className="rawq-group-lbl">{KIND_LABEL[g.kind] ?? g.kind}</div>
              {g.items.map(it => (
                <button
                  key={`${it.value}${it.index}`}
                  type="button"
                  className={clsx('rawq-item', { 'is-active': it.index === highlight })}
                  onMouseEnter={() => setHighlight(it.index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => apply(it)}
                >
                  <span className="rawq-item-badge">{KIND_BADGE[it.kind] ?? '·'}</span>
                  <span className="rawq-item-val mono">{it.value.trim()}</span>
                  {it.detail && <span className="rawq-item-detail">{it.detail}</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="rawq-foot">
            <kbd>↑↓</kbd> navigate <kbd>Tab</kbd> complete <kbd>Enter</kbd> run <kbd>Esc</kbd> dismiss
          </div>
        </div>
      )}
    </div>
  )
}

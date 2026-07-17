import { useState, useRef, useEffect, useCallback } from 'react'
import { services, SEARCH_INDEX, SEARCH_RECENT } from '@/data/services'

const TIME_PRESETS = ['Last 5 minutes','Last 15 minutes','Last 30 minutes','Last 1 hour','Last 2 hours','Last 3 hours','Last 6 hours','Last 12 hours','Last 24 hours','Last 2 days','Last 3 days','Last 7 days','Today','Today so far']

function SvgIcon({ name, className, style }) {
  const paths = {
    home: <><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></>,
    pulse: <path d="M3 12h4l2 8 4-16 2 8h6"/>,
    logs: <><path d="M4 5h16M4 9h16M4 13h10M4 17h7"/></>,
    server: <><rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><circle cx="7" cy="7" r=".7"/><circle cx="7" cy="17" r=".7"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    refresh: <><path d="M4 4v6h6M20 20v-6h-6"/><path d="M5 15a8 8 0 0013.9 3.2M19 9A8 8 0 005.1 5.8"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    gear: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    help: <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    chevronDown: <path d="M6 9l6 6 6-6"/>,
    chevRight: <path d="M9 6l6 6-6 6"/>,
    check: <path d="M20 6L9 17l-5-5"/>,
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      {paths[name]}
    </svg>
  )
}

export default function Header({ view, serviceId, timeRange, setTimeRange, settingsOpen, setSettingsOpen, selectService, onLogout }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHL, setSearchHL] = useState(-1)
  const searchRef = useRef(null)
  const searchWrapRef = useRef(null)
  const timeBtnRef = useRef(null)

  const isHome = view === 'home'
  const isLogs = view === 'logs'
  const isInfra = view === 'infra'
  const isService = view === 'service'
  const pageLabel = isHome ? 'Home' : isLogs ? 'Logs' : isInfra ? 'Infrastructure' : 'APM & Services'
  const pageIcon = isHome ? 'home' : isLogs ? 'logs' : isInfra ? 'server' : 'pulse'
  const searchPlaceholder = isHome
    ? 'Search services, hosts, traces…'
    : isLogs
      ? 'Filter logs - service, level, message…'
      : isInfra
        ? 'Filter hosts, containers, integrations…'
        : `Search ${services.find(s => s.id === serviceId)?.name} - endpoints, traces, logs…`

  const q = searchQuery.trim().toLowerCase()
  const searchResults = q
    ? SEARCH_INDEX.filter(i => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
    : SEARCH_INDEX.filter(i => SEARCH_RECENT.includes(i.id))

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchHL(-1)
  }, [])

  const activateItem = useCallback((id) => {
    const item = SEARCH_INDEX.find(i => i.id === id)
    if (!item) return
    closeSearch()
    if (item.type === 'service') selectService(id)
  }, [selectService, closeSearch])

  const onSearchKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSearchHL(h => Math.min(h + 1, searchResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSearchHL(h => Math.max(h - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (searchHL >= 0 && searchResults[searchHL]) activateItem(searchResults[searchHL].id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeSearch()
      searchRef.current?.blur()
    }
  }

  useEffect(() => {
    const handler = (e) => {
      if (profileOpen && !e.target.closest('.avatar') && !e.target.closest('.pop')) setProfileOpen(false)
      if (timeOpen && !e.target.closest('.time-portal')) setTimeOpen(false)
      if (searchOpen && !e.target.closest('.search-panel') && !e.target.closest('.search-wrap')) closeSearch()
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [profileOpen, timeOpen, searchOpen, closeSearch])

  const searchRect = searchWrapRef.current?.getBoundingClientRect()

  return (
    <div className="header">
      <div className="header-page-id">
        <SvgIcon name={pageIcon} />
        <span>{pageLabel}</span>
      </div>
      <div className="header-spacer" />

      <div className="search-wrap" ref={searchWrapRef}>
        <SvgIcon name="search" />
        <input
          ref={searchRef}
          className="search-input"
          placeholder={searchPlaceholder}
          aria-label="Search"
          autoComplete="off"
          value={searchQuery}
          onFocus={() => setSearchOpen(true)}
          onChange={e => { setSearchQuery(e.target.value); setSearchHL(-1); if (!searchOpen) setSearchOpen(true) }}
          onKeyDown={onSearchKey}
        />
      </div>

      {searchOpen && searchRect && (
        <SearchPortal
          rect={searchRect}
          query={q}
          results={searchResults}
          hl={searchHL}
          setHL={setSearchHL}
          onActivate={activateItem}
          onClear={() => { setSearchQuery(''); setSearchHL(-1); searchRef.current?.focus() }}
        />
      )}

      <div className="header-right">
        <button className="hbtn icon" title="Refresh now"><SvgIcon name="refresh" /></button>

        <div style={{ position: 'relative' }} ref={timeBtnRef}>
          <button
            className={`hbtn${timeOpen ? ' active' : ''}`}
            title="Time range"
            onClick={(e) => { e.stopPropagation(); setTimeOpen(o => !o) }}
          >
            <SvgIcon name="clock" /> {timeRange} <SvgIcon name="chevronDown" />
          </button>
          {timeOpen && (
            <TimePanel
              timeRange={timeRange}
              setTimeRange={(v) => { setTimeRange(v); setTimeOpen(false) }}
              anchorRef={timeBtnRef}
            />
          )}
        </div>

        {(isService || isInfra) && (
          <button
            className={`hbtn icon${settingsOpen ? ' active' : ''}`}
            title="Settings"
            aria-label="Open settings"
            onClick={() => setSettingsOpen(o => !o)}
          >
            <SvgIcon name="gear" />
          </button>
        )}

        <button className="hbtn icon" title="Help" aria-label="Help and documentation"><SvgIcon name="help" /></button>

        <div style={{ position: 'relative' }}>
          <button className="avatar" onClick={(e) => { e.stopPropagation(); setProfileOpen(o => !o) }} title="Account" aria-label="Account menu">S</button>
          {profileOpen && (
            <div className="pop" onClick={e => e.stopPropagation()}>
              <div className="pop-head">
                <div className="pop-name">CubeAPM <span className="pop-plan">Full platform</span></div>
                <div className="pop-email">tech@cubeapm.com</div>
              </div>
              <div className="pop-sec">
                <div className="pop-sec-lbl">Settings</div>
                <div className="pop-item">User preferences</div>
                <div className="pop-item">Theme <span className="theme-seg"><span>Light</span><span className="on">Dark</span><span>Auto</span></span></div>
              </div>
              <div className="pop-sec">
                <div className="pop-sec-lbl">Manage</div>
                <div className="pop-item">Administration</div>
                <div className="pop-item">API keys</div>
                <div className="pop-item">Manage your plan</div>
              </div>
              <div className="pop-sec"><div className="pop-item danger" onClick={() => { setProfileOpen(false); onLogout?.() }}>Log out</div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SearchPortal({ rect, query, results, hl, setHL, onActivate, onClear }) {
  const clampedLeft = Math.min(rect.left, window.innerWidth - rect.width - 8)
  const style = {
    position: 'fixed',
    top: rect.bottom + 6,
    left: Math.max(8, clampedLeft),
    width: rect.width,
    zIndex: 490,
  }

  const sectionLabel = query ? 'RESULTS' : 'LAST VIEWED'

  let body
  if (query && results.length === 0) {
    body = (
      <div className="search-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="26" height="26">
          <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v3M11 14v.01"/>
        </svg>
        <div className="search-empty-title">No results for &ldquo;{query}&rdquo;</div>
        <div className="search-empty-sub">Try a service name, infrastructure node, or section - e.g. &quot;redis&quot;, &quot;payment&quot;, or &quot;traces&quot;.</div>
        <button className="search-empty-clear" onClick={onClear}>Clear search</button>
      </div>
    )
  } else {
    body = (
      <>
        <div className="search-section-label">{sectionLabel}</div>
        {results.map((item, i) => (
          <div
            key={item.id}
            className={`search-item${hl === i ? ' hl' : ''}`}
            onClick={() => onActivate(item.id)}
            onMouseEnter={() => setHL(i)}
          >
            <span className={`search-item-dot ${item.status || 'none'}`} />
            <span className="search-item-name">{item.name}</span>
            <span className="search-item-cat">{item.category}</span>
            <span className="search-item-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </span>
          </div>
        ))}
      </>
    )
  }

  return (
    <div className="dd-panel search-panel" style={style} onClick={e => e.stopPropagation()}>
      <div className="search-panel-body">{body}</div>
      <div className="search-footer">
        <span className="search-kbd-hint"><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
        <span className="search-kbd-hint"><kbd>↵</kbd> Open</span>
        <span className="search-kbd-hint"><kbd>Esc</kbd> Close</span>
      </div>
    </div>
  )
}

function TimePanel({ timeRange, setTimeRange, anchorRef }) {
  const r = anchorRef.current?.getBoundingClientRect()
  if (!r) return null
  const panelW = 460
  const left = Math.min(r.right - panelW, window.innerWidth - panelW - 8)
  const style = {
    position: 'fixed',
    top: r.bottom + 4,
    left: Math.max(8, left),
    zIndex: 500,
  }
  return (
    <div className="dd-panel time-portal" style={style} onClick={e => e.stopPropagation()}>
      <div className="time-panel">
        <div className="time-panel-custom">
          <div className="time-panel-title">Select time range</div>
          <div className="time-field">
            <label>From</label>
            <div className="time-field-input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <input type="text" placeholder="Select date" />
            </div>
          </div>
          <div className="time-field">
            <label>To</label>
            <div className="time-field-input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <input type="text" placeholder="Select date" />
            </div>
          </div>
          <button className="time-apply">Apply</button>
        </div>
        <div className="time-panel-presets">
          {TIME_PRESETS.map(p => (
            <div key={p} className={`time-preset${p === timeRange ? ' active' : ''}`} onClick={() => setTimeRange(p)}>{p}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'

/**
 * Theme control for the whole platform.
 *
 * A single attribute — document.documentElement[data-theme] — selects the
 * active theme; index.css re-points its semantic + component tokens under
 * :root[data-theme="light"]. Preference is one of 'light' | 'dark' | 'auto'
 * and persists in localStorage. 'auto' follows the OS via prefers-color-scheme.
 *
 * Default is 'dark' (the platform's original look) so unset/first-load never
 * flashes the wrong way. main.jsx calls applyTheme() before React renders to
 * avoid a flash-of-wrong-theme on reload.
 */

const KEY = 'cubeapm-theme'
export const THEME_OPTIONS = ['light', 'dark', 'auto']

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(KEY)
    return THEME_OPTIONS.includes(v) ? v : 'dark'
  } catch {
    return 'dark'
  }
}

function prefersLight() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: light)').matches
}

export function resolveTheme(pref) {
  if (pref === 'auto') return prefersLight() ? 'light' : 'dark'
  return pref === 'light' ? 'light' : 'dark'
}

export function applyTheme(pref) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolveTheme(pref)
}

export function useTheme() {
  const [theme, setTheme] = useState(getStoredTheme)

  // Persist + apply on every change.
  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])

  // While on 'auto', react to OS theme changes live.
  useEffect(() => {
    if (theme !== 'auto' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => applyTheme('auto')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme(t => (resolveTheme(t) === 'light' ? 'dark' : 'light'))
  }, [])

  return { theme, setTheme, resolved: resolveTheme(theme), toggle }
}

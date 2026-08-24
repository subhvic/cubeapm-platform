import { useEffect } from 'react'

export default function Toast({ message, onClose, duration = 4500 }) {
  useEffect(() => {
    if (!duration) return
    const t = setTimeout(() => onClose?.(), duration)
    return () => clearTimeout(t)
  }, [message, duration, onClose])

  return (
    <div className="toast-bar" role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v.01M11 12h1v4h1" />
      </svg>
      <span className="toast-msg">{message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
    </div>
  )
}

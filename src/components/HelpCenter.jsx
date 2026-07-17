import { useState, useMemo, useEffect } from 'react'

const HELP_TOPICS = [
  {
    category: 'Getting Started',
    icon: '🚀',
    items: [
      { title: 'First steps with CubeAPM', desc: 'Learn how to instrument your first service and get data flowing.' },
      { title: 'Understanding the dashboard', desc: 'Overview of the Home page and key metrics at a glance.' },
      { title: 'Setting up alerts', desc: 'Create alert rules to stay notified of critical issues.' },
    ],
  },
  {
    category: 'APM & Services',
    icon: '📊',
    items: [
      { title: 'Service overview', desc: 'Explore latency, error rate, and throughput metrics for any service.' },
      { title: 'Service topology', desc: 'Visualize how your services connect and communicate.' },
      { title: 'Endpoint analysis', desc: 'Drill down into individual endpoints to find performance bottlenecks.' },
      { title: 'External calls', desc: 'Monitor calls to external APIs and third-party services.' },
      { title: 'Database queries', desc: 'Identify slow database operations and optimize queries.' },
    ],
  },
  {
    category: 'Logs',
    icon: '📝',
    items: [
      { title: 'Searching logs', desc: 'Use filters and text search to find relevant log entries quickly.' },
      { title: 'Log levels explained', desc: 'Understand ERROR, WARN, INFO, and DEBUG log levels.' },
      { title: 'Faceted filtering', desc: 'Filter logs by service, namespace, deployment, and more.' },
    ],
  },
  {
    category: 'Infrastructure',
    icon: '🖥️',
    items: [
      { title: 'Host monitoring', desc: 'Track CPU, memory, disk, and network metrics for your infrastructure.' },
      { title: 'Integration sources', desc: 'Connect AWS, GCP, Kubernetes, and other infrastructure providers.' },
      { title: 'Process-level insights', desc: 'Monitor individual processes and their resource consumption.' },
    ],
  },
  {
    category: 'Troubleshooting',
    icon: '🔧',
    items: [
      { title: 'No data showing?', desc: 'Verify your services are properly instrumented and connected.' },
      { title: 'High latency alerts', desc: 'Root cause analysis steps for elevated response times.' },
      { title: 'Error spikes', desc: 'How to investigate sudden increases in error rates.' },
    ],
  },
]

export default function HelpCenter({ onClose }) {
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) return HELP_TOPICS

    const q = searchQuery.toLowerCase()
    return HELP_TOPICS.map(category => ({
      ...category,
      items: category.items.filter(
        item => item.title.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)
      ),
    })).filter(category => category.items.length > 0)
  }, [searchQuery])

  return (
    <div className="help-center">
      <div className="help-header">
        <div className="help-title-block">
          <button className="help-close" onClick={onClose} aria-label="Close help center" title="Close (Esc)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div>
            <h2 className="help-title">Help Center</h2>
            <p className="help-subtitle">Understand CubeAPM and find what you need</p>
          </div>
        </div>
        <div className="help-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input
            type="text"
            placeholder="Search help topics..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      <div className="help-content">
        {filteredTopics.length > 0 ? (
          filteredTopics.map(category => (
            <div key={category.category} className="help-category">
              <div className="help-category-head">
                <span className="help-category-icon">{category.icon}</span>
                <h3 className="help-category-title">{category.category}</h3>
              </div>
              <div className="help-items">
                {category.items.map((item, i) => (
                  <div key={i} className="help-item">
                    <div className="help-item-title">{item.title}</div>
                    <div className="help-item-desc">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="help-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="32" height="32">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v3M11 14v.01"/>
            </svg>
            <div className="help-empty-title">No results found</div>
            <div className="help-empty-desc">Try searching with different keywords</div>
          </div>
        )}
      </div>

      <div className="help-footer">
        <div className="help-footer-hint">
          <kbd>Esc</kbd> to close · <kbd>↑↓</kbd> to scroll
        </div>
      </div>
    </div>
  )
}

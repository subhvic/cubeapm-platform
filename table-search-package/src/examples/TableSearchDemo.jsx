// Reference wiring for both variants, over a table small enough to read.
//
// This file is the one thing in the package that was written for the package
// rather than copied out of the app — everything else is byte-identical to the
// source. It exists because the real call sites live inside two large pages
// (the services table on Home, two pod tables under Infrastructure) and the
// twenty lines that matter are hard to see from there. The wiring below is the
// same wiring, lifted clear of the pages around it.
//
// Both variants are shown on one screen so the difference is visible: the same
// field, the same shell, one of them with a syntax and one without.

import { useMemo, useState } from 'react'
import TableSearch from '@/components/TableSearch'
import TableQuerySearch from '@/components/TableQuerySearch'
import { parsePodQuery, matchesPod, highlightsFor } from '@/utils/tableQuery'
import { highlightTerms } from '@/utils/highlight'

const PODS = [
  { name: 'payment-service-7d8b9c-4vk2q', namespace: 'default', node: 'ip-10-0-142-133' },
  { name: 'redis-0', namespace: 'default', node: 'ip-10-0-142-133' },
  { name: 'coredns-66bc5c9577-zkrnm', namespace: 'kube-system', node: 'ip-10-0-142-133' },
  { name: 'kube-proxy-784j7', namespace: 'kube-system', node: 'ip-10-0-143-40' },
]

// What the user types, paired with the row property it reads. The two differ
// more often than not — here the "pod" column is a row's `name`.
const FIELDS = [
  { name: 'pod', key: 'name' },
  { name: 'namespace', key: 'namespace' },
]

// ── Variant 1: one searchable column ──────────────────────────────────────
// Plain substring match, applied as it is typed. The parent owns the text.
function SingleFieldTable() {
  const [search, setSearch] = useState('')
  const term = search.trim()

  const shown = useMemo(() => {
    if (!term) return PODS
    const q = term.toLowerCase()
    return PODS.filter(p => p.name.toLowerCase().includes(q))
  }, [term])

  return (
    <div className="panel">
      <div className="panel-head is-stacked">
        {/* Title and hint share the top row so the field below can span the
            panel's full width rather than stopping short of the hint. */}
        <div className="panel-head-row">
          <span>Pods</span>
          <span className="hint">
            {term ? `${shown.length} of ${PODS.length} pods` : `${PODS.length} pods`}
          </span>
        </div>
        <TableSearch value={search} onChange={setSearch} placeholder="Search pod" />
      </div>

      {shown.length === 0 && (
        <div className="pod-empty-row">No data matches “{term}”.</div>
      )}
      {shown.map(p => (
        <div key={p.name} className="appdb-summary-row">
          {/* One element whether highlighted or not: a flex row with a gap
              would space each returned fragment apart. */}
          <span className="host-cell mono">
            {term ? highlightTerms(p.name, [term], 'svc-hit') : p.name}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Variant 2: several searchable columns ─────────────────────────────────
// The field hands up a query string; the page parses it and filters. Only a
// query that parses is ever handed up, so `ok` is a belt-and-braces guard.
function MultiFieldTable() {
  const [query, setQuery] = useState('')

  const { node, ok } = parsePodQuery(query, FIELDS)
  const shown = useMemo(
    () => (ok ? PODS.filter(p => matchesPod(node, p, FIELDS)) : PODS),
    [node, ok],
  )
  // The terms to mark per column: a field term highlights only in its own
  // column, free text in all of them, so the highlight explains which clause
  // matched rather than colouring anything that looks similar.
  const hits = useMemo(
    () => (ok ? highlightsFor(node, FIELDS) : { pod: [], namespace: [] }),
    [node, ok],
  )

  return (
    <div className="panel">
      <div className="panel-head is-stacked">
        <div className="panel-head-row">
          <span>Pods</span>
          <span className="hint">
            {query.trim() ? `${shown.length} of ${PODS.length} pods` : `${PODS.length} pods`}
          </span>
        </div>
        {/* No placeholder prop: it is generated from the field set, so every
            table with more than one searchable column advertises the same form. */}
        <TableQuerySearch onApply={setQuery} fields={FIELDS} />
      </div>

      {shown.length === 0 && (
        <div className="pod-empty-row">No data matches “{query.trim()}”.</div>
      )}
      {shown.map(p => (
        <div key={p.name} className="appdb-summary-row">
          <span className="host-cell mono">{highlightTerms(p.name, hits.pod, 'svc-hit')}</span>
          <span className="num-cell">{highlightTerms(p.namespace, hits.namespace, 'svc-hit')}</span>
        </div>
      ))}
    </div>
  )
}

export default function TableSearchDemo() {
  return (
    <div className="svc-main">
      <SingleFieldTable />
      <MultiFieldTable />
    </div>
  )
}

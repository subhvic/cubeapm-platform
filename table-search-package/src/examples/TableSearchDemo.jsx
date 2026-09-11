// Reference wiring for both variants, over a table small enough to read.
//
// This file is the one thing in the package that was written for the package
// rather than copied out of the app — everything else is byte-identical to the
// source. It exists because the real call sites live inside two large pages
// (the services table on Home, two pod tables under Infrastructure) and the
// twenty lines that matter are hard to see from there. The wiring below is the
// same wiring, lifted clear of the pages around it.
//
// Both variants are shown on one screen so the difference is visible. They
// speak the same language; what separates them is how many columns there are
// to aim it at.

import { useMemo, useState } from 'react'
import TableSearch from '@/components/TableSearch'
import TableQuerySearch from '@/components/TableQuerySearch'
import {
  parsePodQuery, matchesPod, highlightsFor, tagHighlightsFor, tagTerms,
} from '@/utils/tableQuery'
import { highlightTerms } from '@/utils/highlight'

// `labels` is this column's tag bag — see FIELDS below.
const PODS = [
  { name: 'payment-service-7d8b9c-4vk2q', namespace: 'default', node: 'ip-10-0-142-133', labels: { app: 'payment', tier: 'backend', team: 'payments' } },
  { name: 'redis-0', namespace: 'default', node: 'ip-10-0-142-133', labels: { app: 'redis', tier: 'cache', team: 'platform' } },
  { name: 'coredns-66bc5c9577-zkrnm', namespace: 'kube-system', node: 'ip-10-0-142-133', labels: { app: 'coredns', tier: 'system' } },
  { name: 'kube-proxy-784j7', namespace: 'kube-system', node: 'ip-10-0-143-40', labels: { app: 'kube-proxy', tier: 'system' } },
]

// What the user types, the row property it reads, and — where the column
// carries tags — the row property holding them. Name and key differ more often
// than not: the "pod" column is a row's `name`.
const ONE_FIELD = [
  { name: 'pod', key: 'name', tags: 'labels' },
]
const FIELDS = [
  { name: 'pod', key: 'name', tags: 'labels' },
  { name: 'namespace', key: 'namespace' },
]

// The chips are why the tags are searchable: they are on screen in this
// column, so a word someone can read has to be a word they can type.
function TagChips({ labels, tagHits, field }) {
  return Object.entries(labels ?? {}).map(([k, v]) => (
    <span key={k} className="svc-tag" title={`${k}: ${v} — search as ${field}.${k}:${v}`}>
      <span className="svc-tag-k">{k}</span>
      <span className="svc-tag-v">{highlightTerms(v, tagTerms(tagHits, field, k), 'svc-hit')}</span>
    </span>
  ))
}

// One table, one wiring, used by both variants below. The only difference
// between them is the field set handed in.
function PodTable({ title, fields, Field }) {
  const [query, setQuery] = useState('')

  // Only a query that parses is ever handed up, so `ok` is belt-and-braces —
  // worth keeping for a caller that sets the query from a URL or a saved view.
  const { node, ok } = parsePodQuery(query, fields)
  const shown = useMemo(
    () => (ok ? PODS.filter(p => matchesPod(node, p, fields)) : PODS),
    [node, ok, fields],
  )
  // Two highlight sets. A term aimed at one column marks only that column, and
  // one aimed at a tag marks only that tag — so the highlight says which clause
  // matched rather than colouring anything that looks similar.
  const hits = useMemo(() => (ok ? highlightsFor(node, fields) : {}), [node, ok, fields])
  const tagHits = useMemo(() => (ok ? tagHighlightsFor(node, fields) : {}), [node, ok, fields])

  return (
    <div className="panel">
      <div className="panel-head is-stacked">
        {/* Title and hint share the top row so the field below can span the
            panel's full width rather than stopping short of the hint. */}
        <div className="panel-head-row">
          <span>{title}</span>
          <span className="hint">
            {query.trim() ? `${shown.length} of ${PODS.length} pods` : `${PODS.length} pods`}
          </span>
        </div>
        {/* No placeholder prop: it is generated from the field set, so adding
            a column or a tag cannot leave a stale example behind. */}
        <Field onApply={setQuery} fields={fields} />
      </div>

      {shown.length === 0 && (
        <div className="pod-empty-row">No data matches “{query.trim()}”.</div>
      )}
      {shown.map(p => (
        <div key={p.name} className="appdb-summary-row">
          {/* .host-cell is a flex row with a gap, so the highlighted name has
              to stay one child or its fragments get spaced apart. */}
          <span className="host-cell mono">
            <span className="host-cell-name">{highlightTerms(p.name, hits.pod ?? [], 'svc-hit')}</span>
            <TagChips labels={p.labels} tagHits={tagHits} field="pod" />
          </span>
          {fields.some(f => f.name === 'namespace') && (
            <span className="num-cell">{highlightTerms(p.namespace, hits.namespace ?? [], 'svc-hit')}</span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function TableSearchDemo() {
  return (
    <div className="svc-main">
      {/* One column. Most queries here are still a word; the syntax earns its
          place on the tags — pod.tier:cache is not a substring of anything. */}
      <PodTable title="Pods — one column" fields={ONE_FIELD} Field={TableSearch} />
      {/* Two columns, so "default" could mean either and the prefix decides. */}
      <PodTable title="Pods — two columns" fields={FIELDS} Field={TableQuerySearch} />
    </div>
  )
}

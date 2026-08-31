// Tree helpers for grouped (parenthesised) queries.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isGroup, newGroup, getAt, flattenLeaves, lastLeafPath, normalize,
  replaceAt, removeAt, appendInto, wrapWithNeighbour, unwrapAt,
  toggleConnectorAt, isAtOrUnder, hasTopLevelOr, concatWithAnd,
  facetStates, setFacetFilter, facetFilterFor, clearFacets,
} from './queryTree.js'

const leaf = (field, value, connector) => (
  connector ? { field, op: 'eq', value, connector } : { field, op: 'eq', value }
)

// A flat array is already a valid tree — this is the backward-compat contract.
const FLAT = [leaf('service', 'order'), leaf('log.level', 'error', 'AND')]

// (service:order OR service:payment) AND (log.level:error OR log.level:warn)
const GROUPED = [
  newGroup([leaf('service', 'order'), leaf('service', 'payment', 'OR')]),
  newGroup([leaf('log.level', 'error'), leaf('log.level', 'warn', 'OR')], 'AND'),
]

// ---------- Shape ----------

test('a plain chip is not a group', () => {
  assert.equal(isGroup(leaf('service', 'order')), false)
  assert.equal(isGroup(newGroup([])), true)
  assert.equal(isGroup(null), false)
})

test('getAt walks paths into nested children', () => {
  assert.deepEqual(getAt(GROUPED, [0, 1]), leaf('service', 'payment', 'OR'))
  assert.equal(getAt(GROUPED, [1]).kind, 'group')
  assert.equal(getAt(GROUPED, []), null)
  assert.equal(getAt(GROUPED, [9]), null)
  assert.equal(getAt(GROUPED, [0, 0, 0]), null)
})

test('flattenLeaves returns leaves in document order', () => {
  assert.deepEqual(
    flattenLeaves(GROUPED).map(l => l.value),
    ['order', 'payment', 'error', 'warn'],
  )
  assert.deepEqual(flattenLeaves(FLAT).map(l => l.value), ['order', 'error'])
})

test('lastLeafPath finds the deepest trailing leaf', () => {
  assert.deepEqual(lastLeafPath(GROUPED), [1, 1])
  assert.deepEqual(lastLeafPath(FLAT), [1])
  assert.equal(lastLeafPath([]), null)
  // An empty group has no leaf, so the group itself is the step-back target.
  assert.deepEqual(lastLeafPath([leaf('a', 'b'), newGroup([])]), [1])
})

test('isAtOrUnder covers self and descendants', () => {
  assert.equal(isAtOrUnder([0, 1], [0]), true)
  assert.equal(isAtOrUnder([0], [0]), true)
  assert.equal(isAtOrUnder([1], [0]), false)
  assert.equal(isAtOrUnder([0], [0, 1]), false)
})

// ---------- normalize ----------

test('normalize drops empty groups', () => {
  assert.deepEqual(normalize([leaf('a', '1'), newGroup([], 'AND')]), [leaf('a', '1')])
})

test('normalize unwraps a single-child group, passing on its connector', () => {
  const out = normalize([leaf('a', '1'), newGroup([leaf('b', '2')], 'OR')])
  assert.deepEqual(out, [leaf('a', '1'), leaf('b', '2', 'OR')])
})

test('normalize strips a leading connector at every level', () => {
  const out = normalize([
    leaf('a', '1', 'OR'),
    newGroup([leaf('b', '2', 'AND'), leaf('c', '3', 'OR')], 'AND'),
  ])
  assert.equal('connector' in out[0], false)
  assert.equal('connector' in out[1].children[0], false)
  assert.equal(out[1].children[1].connector, 'OR')
})

test('normalize leaves a well-formed tree untouched and is idempotent', () => {
  assert.deepEqual(normalize(GROUPED), GROUPED)
  assert.deepEqual(normalize(normalize(GROUPED)), GROUPED)
  assert.deepEqual(normalize(FLAT), FLAT)
})

test('normalize protects the group the user just opened', () => {
  const withEmpty = [leaf('a', '1'), newGroup([], 'AND')]
  assert.equal(normalize(withEmpty, [1]).length, 2)
  assert.equal(normalize(withEmpty, null).length, 1)
})

// ---------- Mutation ----------

test('replaceAt swaps a nested node without touching siblings', () => {
  const out = replaceAt(GROUPED, [0, 1], leaf('service', 'cart', 'OR'))
  assert.equal(out[0].children[1].value, 'cart')
  assert.equal(out[0].children[0].value, 'order')
  assert.deepEqual(out[1], GROUPED[1])
})

test('removeAt collapses a group down to its last remaining child', () => {
  // Removing one of two children leaves a 1-child group, which unwraps.
  const out = removeAt(GROUPED, [0, 1])
  assert.equal(isGroup(out[0]), false)
  assert.equal(out[0].value, 'order')
  assert.equal('connector' in out[0], false)
  assert.equal(isGroup(out[1]), true)
})

test('appendInto adds to an open group without collapsing it', () => {
  const opened = [leaf('a', '1'), newGroup([], 'AND')]
  const out = appendInto(opened, [1], leaf('b', '2'))
  assert.equal(out[1].children.length, 1)
  // First child of a group carries no connector.
  assert.equal('connector' in out[1].children[0], false)
})

test('appendInto with no path appends at the root', () => {
  const out = appendInto(FLAT, [], leaf('c', '3', 'AND'))
  assert.equal(out.length, 3)
  assert.equal(out[2].value, '3')
})

// ---------- Grouping ----------

test('wrapWithNeighbour groups two adjacent leaves', () => {
  const out = wrapWithNeighbour(FLAT, [0], 'next')
  assert.equal(out.length, 1)
  assert.equal(isGroup(out[0]), true)
  assert.deepEqual(out[0].children.map(c => c.value), ['order', 'error'])
  assert.equal(out[0].children[1].connector, 'AND')
})

test('wrapWithNeighbour absorbs a leaf into an existing group rather than nesting', () => {
  const nodes = [newGroup([leaf('a', '1'), leaf('b', '2', 'OR')]), leaf('c', '3', 'AND')]
  const out = wrapWithNeighbour(nodes, [1], 'prev')
  assert.equal(out.length, 1)
  assert.deepEqual(out[0].children.map(c => c.value), ['1', '2', '3'])
})

test('wrapWithNeighbour absorbs a leading leaf into the group after it', () => {
  const nodes = [leaf('c', '3'), newGroup([leaf('a', '1'), leaf('b', '2', 'OR')], 'AND')]
  const out = wrapWithNeighbour(nodes, [0], 'next')
  assert.equal(out.length, 1)
  assert.deepEqual(out[0].children.map(c => c.value), ['3', '1', '2'])
  // The absorbed group's old connector now joins its first child to `c`.
  assert.equal(out[0].children[1].connector, 'AND')
  assert.equal(out[0].children[2].connector, 'OR')
})

test('wrapWithNeighbour nests when both sides are groups', () => {
  const out = wrapWithNeighbour(GROUPED, [0], 'next')
  assert.equal(out.length, 1)
  assert.equal(isGroup(out[0].children[0]), true)
  assert.equal(isGroup(out[0].children[1]), true)
  assert.equal(out[0].children[1].connector, 'AND')
})

test('wrapWithNeighbour is a no-op at the edges', () => {
  assert.deepEqual(wrapWithNeighbour(FLAT, [0], 'prev'), FLAT)
  assert.deepEqual(wrapWithNeighbour(FLAT, [1], 'next'), FLAT)
})

test('unwrapAt splices children back, keeping the group connector on the first', () => {
  const out = unwrapAt(GROUPED, [1])
  assert.equal(out.length, 3)
  assert.deepEqual(out.map(n => n.value ?? 'group'), ['group', 'error', 'warn'])
  assert.equal(out[1].connector, 'AND')
  assert.equal(out[2].connector, 'OR')
})

test('unwrapAt round-trips wrapWithNeighbour', () => {
  const wrapped = wrapWithNeighbour(FLAT, [0], 'next')
  assert.deepEqual(unwrapAt(wrapped, [0]), FLAT)
})

test('toggleConnectorAt flips AND/OR and never touches a first sibling', () => {
  assert.equal(toggleConnectorAt(FLAT, [1])[1].connector, 'OR')
  assert.deepEqual(toggleConnectorAt(FLAT, [0]), FLAT)
  assert.equal(toggleConnectorAt(GROUPED, [0, 1])[0].children[1].connector, 'AND')
})

// ---------- concatWithAnd (pasting onto an existing bar) ----------

test('hasTopLevelOr only looks at the top level', () => {
  assert.equal(hasTopLevelOr([leaf('a', '1'), leaf('b', '2', 'OR')]), true)
  assert.equal(hasTopLevelOr([leaf('a', '1'), leaf('b', '2', 'AND')]), false)
  assert.equal(hasTopLevelOr([newGroup([leaf('a', '1'), leaf('b', '2', 'OR')])]), false)
})

test('concatWithAnd joins two plain lists with AND', () => {
  const out = concatWithAnd([leaf('service', 'order')], [leaf('log.level', 'error')])
  assert.deepEqual(out, [
    { field: 'service', op: 'eq', value: 'order' },
    { field: 'log.level', op: 'eq', value: 'error', connector: 'AND' },
  ])
})

test('concatWithAnd brackets an incoming top-level OR so it cannot escape', () => {
  const out = concatWithAnd(
    [leaf('service', 'order')],
    [leaf('log.level', 'error'), leaf('log.level', 'warn', 'OR')],
  )
  assert.equal(out.length, 2)
  assert.equal(isGroup(out[1]), true)
  assert.equal(out[1].connector, 'AND')
  assert.deepEqual(out[1].children.map(n => n.value), ['error', 'warn'])
})

test('concatWithAnd leaves an existing top-level OR flat — the fold already covers it', () => {
  const out = concatWithAnd(
    [leaf('service', 'order'), leaf('service', 'payment', 'OR')],
    [leaf('log.level', 'error')],
  )
  assert.equal(out.length, 3)
  assert.equal(out.every(n => !isGroup(n)), true)
  assert.equal(out[2].connector, 'AND')
})

test('concatWithAnd with an empty side returns the other, without a leading connector', () => {
  const incoming = [leaf('log.level', 'error'), leaf('log.level', 'warn', 'OR')]
  assert.deepEqual(concatWithAnd([], incoming), incoming)
  assert.deepEqual(concatWithAnd(incoming, []), incoming)
  assert.equal(concatWithAnd([], incoming)[0].connector, undefined)
})

// ---------- Facet filters (the filters panel, expressed as chips) ----------

const ne = (field, value, connector) => (
  connector ? { field, op: 'neq', value, connector } : { field, op: 'neq', value }
)

const LEVELS = ['error', 'warn', 'info']
const sel = (...v) => new Set(v)

// The panel never calls the setter directly; it decides a selection and lets
// facetFilterFor pick the shape. These helpers mirror that pairing so the tests
// exercise the same path the UI does.
const setSel = (nodes, field, selected, all, prefer) =>
  setFacetFilter(nodes, field, facetFilterFor(selected, all, prefer))
const readSel = (nodes, field, all) => {
  const st = facetStates(nodes).get(field)
  if (!st) return new Set(all)
  return st.mode === 'include'
    ? new Set(st.values)
    : new Set(all.filter(v => !st.values.has(v)))
}

test('everything ticked is an empty tree — no chips means "*"', () => {
  assert.deepEqual(setSel([], 'log.level', sel(...LEVELS), LEVELS), [])
  assert.equal(facetStates([]).size, 0)
})

test('unticking one value excludes it', () => {
  const out = setSel([], 'log.level', sel('warn', 'info'), LEVELS)
  assert.deepEqual(out, [ne('log.level', 'error')])
})

// The whole reason exclusions cannot be an OR group: every record has exactly
// one log.level, so `!=error OR !=warn` is true of all of them.
test('several exclusions on one field join with AND, never OR', () => {
  const out = setSel([], 'log.level', sel('info'), LEVELS)
  assert.deepEqual(out, [newGroup([ne('log.level', 'error'), ne('log.level', 'warn', 'AND')])])
})

test('inclusions on one field join with OR', () => {
  const out = setFacetFilter([], 'log.level', { mode: 'include', values: ['error', 'warn'] })
  assert.deepEqual(out, [newGroup([leaf('log.level', 'error'), leaf('log.level', 'warn', 'OR')])])
})

test('different fields join with AND', () => {
  let out = setSel([], 'log.level', sel('warn', 'info'), LEVELS)
  out = setSel(out, 'service', sel('api'), ['api', 'auth'])
  assert.deepEqual(out, [ne('log.level', 'error'), ne('service', 'auth')])
})

test('re-ticking the last unticked value clears the field entirely', () => {
  let out = setSel([], 'log.level', sel('info'), LEVELS)
  out = setSel(out, 'log.level', sel('warn', 'info'), LEVELS)
  out = setSel(out, 'log.level', sel(...LEVELS), LEVELS)
  assert.deepEqual(out, [])
})

// Datadog's own behaviour: `Only` writes an inclusion even though the same
// selection is expressible as an exclusion, because that is what was meant.
test('prefer decides the shape when both express the same selection', () => {
  const one = sel('error')
  assert.deepEqual(
    setSel([], 'log.level', one, LEVELS, 'include'),
    [leaf('log.level', 'error')])
  assert.deepEqual(
    setSel([], 'log.level', one, LEVELS, 'exclude'),
    [newGroup([ne('log.level', 'warn'), ne('log.level', 'info', 'AND')])])
})

test('nothing ticked is expressible only as excluding everything', () => {
  const out = setSel([], 'log.level', sel(), LEVELS, 'include')
  assert.deepEqual(facetStates(out).get('log.level'), { mode: 'exclude', values: sel(...LEVELS) })
  assert.deepEqual(readSel(out, 'log.level', LEVELS), sel())
})

test('facetStates reads both shapes back', () => {
  let out = setSel([], 'log.level', sel('error'), LEVELS, 'include')
  out = setSel(out, 'service', sel('api'), ['api', 'auth'], 'exclude')
  const st = facetStates(out)
  assert.deepEqual(st.get('log.level'), { mode: 'include', values: sel('error') })
  assert.deepEqual(st.get('service'), { mode: 'exclude', values: sel('auth') })
  assert.deepEqual(readSel(out, 'log.level', LEVELS), sel('error'))
})

test('hand-built filters are left alone', () => {
  const hand = { field: 'path', op: 'contains', value: 'pay' }
  assert.equal(facetStates([hand]).size, 0)
  const out = setSel([hand], 'log.level', sel('warn', 'info'), LEVELS)
  assert.deepEqual(out, [hand, ne('log.level', 'error')])
  assert.deepEqual(clearFacets(out), [hand])
})

// An OR of exclusions is not a shape the panel can produce, so reading it as
// one would let a hand-written filter be silently rewritten by a tick.
test('an OR of exclusions is not a facet', () => {
  const or = [newGroup([ne('log.level', 'error'), ne('log.level', 'warn', 'OR')])]
  assert.equal(facetStates(or).size, 0)
  assert.deepEqual(clearFacets(or), or)
})

test('an AND of inclusions on one field is not a facet either', () => {
  const and = [newGroup([leaf('service', 'api'), leaf('service', 'auth', 'AND')])]
  assert.equal(facetStates(and).size, 0)
})

test('clearFacets re-ticks everything, keeping hand-built filters', () => {
  const hand = { field: 'path', op: 'contains', value: 'pay' }
  let out = [hand]
  out = setSel(out, 'log.level', sel('info'), LEVELS)
  out = setSel(out, 'service', sel('api'), ['api', 'auth'], 'include')
  assert.deepEqual(clearFacets(out), [hand])
})

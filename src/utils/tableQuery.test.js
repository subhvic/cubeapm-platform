// The pod filter language: two fields, unions, AND/OR, and the errors people
// actually type their way into.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePodQuery, matchesPod, highlightsFor, segmentQuery, isPlainQuery,
  POD_FIELDS, POD_NODE_FIELDS,
} from './tableQuery.js'

const pod = (name, namespace) => ({ name, namespace })
const PODS = [
  pod('payment-service-7d8b9c-4vk2q', 'default'),
  pod('redis-0', 'default'),
  pod('coredns-66bc5c9577-zkrnm', 'kube-system'),
  pod('kube-proxy-784j7', 'kube-system'),
]

const run = (q) => {
  const r = parsePodQuery(q)
  assert.equal(r.ok, true, `expected "${q}" to parse, got: ${r.error}`)
  return PODS.filter(p => matchesPod(r.node, p)).map(p => p.name)
}
const fails = (q) => {
  const r = parsePodQuery(q)
  assert.equal(r.ok, false, `expected "${q}" to fail`)
  return r.error
}

// ---------- Nothing ----------

test('an empty query is not a filter', () => {
  assert.deepEqual(run(''), PODS.map(p => p.name))
  assert.deepEqual(run('   '), PODS.map(p => p.name))
  assert.equal(parsePodQuery('').node, null)
})

// ---------- Free text ----------

test('bare text searches both fields', () => {
  assert.deepEqual(run('redis'), ['redis-0'])
  // matches on namespace, not name
  assert.deepEqual(run('kube-system'), ['coredns-66bc5c9577-zkrnm', 'kube-proxy-784j7'])
})

test('matching is case-insensitive and substring', () => {
  assert.deepEqual(run('REDIS'), ['redis-0'])
  assert.deepEqual(run('pay'), ['payment-service-7d8b9c-4vk2q'])
})

// ---------- Fields ----------

test('a field term searches only that field', () => {
  // "kube" appears in a pod name and in a namespace; the field decides which
  assert.deepEqual(run('pod:kube'), ['kube-proxy-784j7'])
  assert.deepEqual(run('namespace:kube'), ['coredns-66bc5c9577-zkrnm', 'kube-proxy-784j7'])
})

test('field names are case-insensitive', () => {
  assert.deepEqual(run('POD:redis'), ['redis-0'])
})

test('a wildcard matches any non-empty value', () => {
  assert.deepEqual(run('pod:*').length, 4)
  assert.deepEqual(run('namespace:*').length, 4)
})

// ---------- Unions ----------

test('a union matches any of its values', () => {
  assert.deepEqual(run('pod:(redis OR coredns)'), ['redis-0', 'coredns-66bc5c9577-zkrnm'])
})

test('a union does not need the OR spelled out', () => {
  assert.deepEqual(run('pod:(redis coredns)'), ['redis-0', 'coredns-66bc5c9577-zkrnm'])
})

// ---------- Operators ----------

test('adjacent terms are ANDed', () => {
  assert.deepEqual(run('pod:redis namespace:default'), ['redis-0'])
  assert.deepEqual(run('pod:redis namespace:kube-system'), [])
})

test('AND and OR do what they say', () => {
  assert.deepEqual(run('pod:redis AND namespace:default'), ['redis-0'])
  assert.deepEqual(run('pod:redis OR pod:coredns'), ['redis-0', 'coredns-66bc5c9577-zkrnm'])
})

test('AND binds tighter than OR', () => {
  // redis (in default) OR anything in kube-system
  const out = run('pod:redis AND namespace:default OR namespace:kube-system')
  assert.deepEqual(out, ['redis-0', 'coredns-66bc5c9577-zkrnm', 'kube-proxy-784j7'])
  // Read the other way it would be redis AND (default OR kube-system) = just redis
  assert.notDeepEqual(out, ['redis-0'])
})

// ---------- Errors ----------

test('errors say what to do about them', () => {
  assert.match(fails('pod:'), /add a value, or pod:\* for any/)
  assert.match(fails('pod:(redis'), /Unclosed "\(" — add the matching "\)"/)
  assert.match(fails('pod:()'), /Empty list/)
  assert.match(fails('cpu:high'), /Unknown field "cpu"\. Search pod or namespace\./)
  assert.match(fails('pod:redis AND'), /needs something on both sides/)
  assert.match(fails('OR pod:redis'), /needs something on both sides/)
  assert.match(fails(':redis'), /needs a field name before it/)
  assert.match(fails('redis)'), /Unmatched "\)"/)
})

test('brackets outside a field value are explained, not silently accepted', () => {
  assert.match(fails('(pod:redis OR pod:coredns)'), /group the values of one field/)
})

// ---------- Highlighting ----------

test('a field term highlights only in its own column', () => {
  const { node } = parsePodQuery('pod:kube')
  assert.deepEqual(highlightsFor(node), { pod: ['kube'], namespace: [] })
})

test('free text highlights in both columns', () => {
  const { node } = parsePodQuery('redis')
  assert.deepEqual(highlightsFor(node), { pod: ['redis'], namespace: ['redis'] })
})

test('a union contributes every value, longest first', () => {
  const { node } = parsePodQuery('pod:(redis OR coredns)')
  assert.deepEqual(highlightsFor(node).pod, ['coredns', 'redis'])
})

test('a wildcard has no text to highlight', () => {
  const { node } = parsePodQuery('pod:*')
  assert.deepEqual(highlightsFor(node), { pod: [], namespace: [] })
})

test('duplicates collapse across clauses', () => {
  const { node } = parsePodQuery('pod:redis OR pod:redis')
  assert.deepEqual(highlightsFor(node).pod, ['redis'])
})

test('a field set is names paired with the row property each reads', () => {
  assert.deepEqual(POD_FIELDS.map(f => f.name), ['pod', 'namespace'])
  // the pod column reads the row's `name`, which is why they are not the same
  assert.equal(POD_FIELDS.find(f => f.name === 'pod').key, 'name')
  assert.deepEqual(POD_NODE_FIELDS.map(f => f.name), ['pod', 'namespace', 'node'])
})

// ---------- A different field set ----------

test('the same language works over a third field', () => {
  const rows = [
    { name: 'redis-0', namespace: 'default', node: 'ip-10-0-142-133' },
    { name: 'kube-proxy-784j7', namespace: 'kube-system', node: 'ip-10-0-143-40' },
  ]
  const q = (text) => {
    const r = parsePodQuery(text, POD_NODE_FIELDS)
    assert.equal(r.ok, true, r.error)
    return rows.filter(x => matchesPod(r.node, x, POD_NODE_FIELDS)).map(x => x.name)
  }
  assert.deepEqual(q('node:143-40'), ['kube-proxy-784j7'])
  assert.deepEqual(q('node:*').length, 2)
  assert.deepEqual(q('142-133'), ['redis-0'])          // free text reaches node too
})

test('a field outside the set is unknown, and the message lists the set', () => {
  assert.match(parsePodQuery('node:x').error, /Unknown field "node"\. Search pod or namespace\./)
  assert.equal(parsePodQuery('node:x', POD_NODE_FIELDS).ok, true)
  assert.match(
    parsePodQuery('cpu:x', POD_NODE_FIELDS).error,
    /Unknown field "cpu"\. Search pod, namespace or node\./,
  )
})

test('segments and highlights follow the field set too', () => {
  assert.equal(segmentQuery('node:x').some(s => s.type === 'field'), false)
  assert.equal(segmentQuery('node:x', POD_NODE_FIELDS)[0].type, 'field')

  const { node } = parsePodQuery('node:abc', POD_NODE_FIELDS)
  assert.deepEqual(highlightsFor(node, POD_NODE_FIELDS), { pod: [], namespace: [], node: ['abc'] })
})

// ---------- Display segments ----------

test('segments cover every character of the input', () => {
  const inputs = ['pod:redis AND namespace:(a OR b)', '  pod:*  ', 'plain text', '', 'pod:']
  for (const s of inputs) {
    assert.equal(segmentQuery(s).map(x => x.text).join(''), s, `round-trip failed for ${JSON.stringify(s)}`)
  }
})

test('a field is coloured only once its colon is typed', () => {
  assert.deepEqual(segmentQuery('pod').map(s => s.type), ['plain'])
  assert.deepEqual(segmentQuery('pod:'), [{ text: 'pod:', type: 'field' }])
})

test('only known field names colour', () => {
  // Adjacent same-type runs merge, so this is one plain span — the point is
  // that nothing in it is typed as a field.
  assert.equal(segmentQuery('cpu:').some(s => s.type === 'field'), false)
  assert.deepEqual(segmentQuery('cpu:'), [{ text: 'cpu:', type: 'plain' }])
})

test('brackets and operators get their own types', () => {
  const types = Object.fromEntries(segmentQuery('pod:(a OR b) AND namespace:c').map(s => [s.text.trim(), s.type]))
  assert.equal(types['pod:'], 'field')
  assert.equal(types['('], 'paren')
  assert.equal(types[')'], 'paren')
  assert.equal(types['OR'], 'op')
  assert.equal(types['AND'], 'op')
  assert.equal(types['namespace:'], 'field')
})

test('lowercase and/or still colour as operators', () => {
  assert.equal(segmentQuery('a or b').find(s => s.text === 'or')?.type, 'op')
})

// ---------- Plain vs query ----------

test('plain text is words and nothing else', () => {
  assert.equal(isPlainQuery(''), true)
  assert.equal(isPlainQuery('redis'), true)
  assert.equal(isPlainQuery('redis cache'), true)
})

test('anything with syntax is a query, not plain text', () => {
  assert.equal(isPlainQuery('pod:redis'), false)
  assert.equal(isPlainQuery('a OR b'), false)
  assert.equal(isPlainQuery('a or b'), false)
  assert.equal(isPlainQuery('(a)'), false)
  assert.equal(isPlainQuery('pod:'), false)
})

test('the form the placeholder advertises actually parses', () => {
  // The pod search placeholder reads "( eg. pod: kube )" — note the space after
  // the colon. A placeholder is a promise, so it is asserted here rather than
  // left to whoever next tidies the tokenizer. The capitalised spellings are
  // checked alongside it because nothing stops a user typing them.
  for (const q of ['pod: kube', 'pod:kube', 'Pod: kube', 'POD:  kube']) {
    assert.deepEqual(run(q), ['kube-proxy-784j7'], `"${q}" should find the kube-proxy pod`)
  }
  assert.equal(segmentQuery('pod: kube')[0].type, 'field')
})

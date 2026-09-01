// What earns a checkbox list. The panel derives its facets from the rows, so
// these rules are the only thing standing between a useful filter list and one
// where every k8s event contributes four uuid columns.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logFacets, isIdentityValue, isNumericValue } from './observability.js'

test('identities are recognised whatever shape they arrive in', () => {
  const identities = [
    '0645290d-aa3e-43af-84fc-2a945a1b7c33',   // uuid
    '9f2c1d4e-77aa-4b31-9c0e-3a51bd0400',     // uuid with a short final group
    '0b3afd6a9d105b54',                       // span id
    '6e258931e62741b440e3d6285b912600',       // trace id
    '2026-09-01T08:29:07Z',                   // ISO instant
    '2026-09-01 08:29:07.281',                // ISO instant, space separated
    'MzQ1Njc4OXxBUE18QVBQTElDQVRJT058MTIz',   // opaque token
  ]
  for (const v of identities) assert.ok(isIdentityValue(v), `${v} should read as an identity`)
})

// The rule has to stay off ordinary category names, several of which are longer
// than a span id and some of which are pure hex by coincidence.
test('category names are not mistaken for identities', () => {
  const categories = [
    'SuccessfulCreate', 'BackOff', 'kube-system', 'etcd-minikube',
    'mysql', 'INSERT', 'cubedemo:search', 'POST /v1/shipment',
    'ip-10-0-129-151', 'io.opentelemetry.jdbc', 'production',
    'deadbeef',                               // hex, but too short to be an id
    'OptimisticLockException',
  ]
  for (const v of categories) assert.ok(!isIdentityValue(v), `${v} should not read as an identity`)
})

test('numbers are recognised, signed and fractional included', () => {
  for (const v of ['200', '0', '-1', '24000000', '1.5']) assert.ok(isNumericValue(v))
  for (const v of ['1.28675ms', 'v8.31.9', '', 'abc']) assert.ok(!isNumericValue(v))
})

// The two directions that matter, asserted against the seeded rows. Counting
// alone cannot separate these: on this data `object.metadata.uid` and
// `object.reason` both carry four distinct values across the four rows that
// have them.
test('identifier fields do not become facets', () => {
  const identifiers = [
    'object.metadata.uid', 'object.regarding.uid', 'k8s.pod.uid',
    'span_id', 'span.id', 'parent_id', 'trace_id', 'trace.id', 'transaction.id',
    'entity.guid', '@timestamp', 'object.metadata.creationTimestamp',
    'k8s.pod.start_time',
  ]
  for (const k of identifiers) assert.ok(!(k in logFacets), `${k} should not be a facet`)
})

test('measurements do not become facets, but codes do', () => {
  for (const k of ['duration', 'duration_ms', 'revision', 'object.metadata.resourceVersion']) {
    assert.ok(!(k in logFacets), `${k} is a measurement, not a facet`)
  }
  // Numeric too, but a handful of values repeated across every row.
  assert.ok('http.status' in logFacets)
})

test('the facets worth having survive all of it', () => {
  const wanted = [
    'log.level', 'service', 'http.status', 'endpoint', 'path',
    'object.reason', 'object.type', 'event.domain',
    'db.system', 'db.operation', 'db.sql.table',
    'k8s.namespace.name', 'k8s.pod.name', 'k8s.container.name',
    'severity', 'level', 'error.class', 'error.type', 'host.name',
  ]
  for (const k of wanted) assert.ok(k in logFacets, `${k} should be a facet`)
})

test('every facet is a listable set of short values', () => {
  for (const [field, opts] of Object.entries(logFacets)) {
    assert.ok(opts.length > 0 && opts.length <= 40, `${field} has ${opts.length} values`)
    for (const o of opts) assert.ok(o.value.length <= 60, `${field} carries a ${o.value.length}-char value`)
  }
})

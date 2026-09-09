// A small query language for filtering a table over a handful of named fields.
//
// Deliberately not the logs query builder: that one is a chip tree with pipes
// and an operator catalogue, and a two- or three-column table does not earn it.
// This is one line of text over a field set the caller supplies.
//
//   payment                    both fields, substring
//   pod:payment                one field
//   namespace:*                the field has any value
//   pod:(redis OR coredns)     a union — one field, several values
//   pod:redis AND namespace:default
//   pod:redis OR pod:coredns
//
// AND binds tighter than OR, which is what every other query language does and
// therefore what someone typing `a OR b AND c` expects. The logs builder's
// flat, precedence-free chip list is a different contract for a different
// input; matching it here would surprise more people than it would please.

// A field is `{ name, key }`: what the user types, and the row property it
// reads. They differ more often than not — the pod column is a row's `name`.
export const POD_FIELDS = [
  { name: 'pod', key: 'name' },
  { name: 'namespace', key: 'namespace' },
]
export const POD_NODE_FIELDS = [...POD_FIELDS, { name: 'node', key: 'node' }]

const namesOf = (fields) => fields.map(f => f.name)
const keyFor = (fields, name) => fields.find(f => f.name === name)?.key

// "pod or namespace", "pod, namespace or node" — the phrasing an error uses to
// say what it will accept.
function listNames(fields) {
  const n = namesOf(fields)
  if (n.length <= 1) return n[0] ?? ''
  return `${n.slice(0, -1).join(', ')} or ${n[n.length - 1]}`
}

// The placeholder is now the only place the syntax is taught, so it is built
// from the field set rather than written out at each call site: every table
// with more than one searchable column then advertises the same form, and
// adding a column cannot leave a stale example behind.
export function placeholderFor(fields = POD_FIELDS) {
  const [a, b] = namesOf(fields)
  return `Search ${listNames(fields)} ( eg. ${b ? `${a}:abc AND ${b}:def` : `${a}:abc`} )`
}

export class PodQueryError extends Error {
  // `span` is [start, end) over the raw text: the characters to underline.
  // Null when the complaint is about text that is not there yet — a query that
  // stops mid-clause — which the caller widens to the whole line.
  //
  // `incomplete` separates the two kinds of wrong. A query that simply ran out
  // — `pod:`, `a AND`, `pod:(a` — is on its way somewhere, and the next
  // keystroke may well finish it. Anything else is a mistake already made:
  // more typing at the end will not repair an unknown field or a stray ")".
  // The field uses the difference to decide how loudly to say so.
  constructor(msg, span = null, incomplete = false) {
    super(msg)
    this.name = 'PodQueryError'
    this.span = span
    this.incomplete = incomplete
  }
}

// ---------- Tokenizer ----------

const isWordChar = (c) => c && !/[\s():]/.test(c)

function tokenize(input) {
  const out = []
  let i = 0
  const s = input ?? ''
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '(' || c === ')' || c === ':') { out.push({ t: c, at: i }); i++; continue }
    let start = i
    while (i < s.length && isWordChar(s[i])) i++
    const word = s.slice(start, i)
    const upper = word.toUpperCase()
    if (upper === 'AND' || upper === 'OR') out.push({ t: upper, at: start })
    else out.push({ t: 'word', value: word, at: start })
  }
  return out
}

// ---------- Parser ----------
// query := or ; or := and (OR and)* ; and := term (AND? term)*

// Every error points at the token it is about, so the field can squiggle those
// characters and nothing else.
const spanOf = (tok) => [tok.at, tok.at + String(tok.value ?? tok.t).length]

function parseTokens(tokens, fields) {
  let pos = 0
  const peek = () => tokens[pos]
  const eat = () => tokens[pos++]

  // `head` is the extent of the `pod:` part, which is what a missing value is
  // really a complaint about.
  function parseValue(field, head) {
    const tok = peek()
    if (!tok) throw new PodQueryError(`Nothing after "${field}:" — add a value, or ${field}:* for any.`, head, true)

    if (tok.t === '(') {
      const open = eat()
      const values = []
      let close = null
      for (;;) {
        const v = peek()
        if (!v) throw new PodQueryError('Unclosed "(" — add the matching ")".', spanOf(open), true)
        if (v.t === ')') { close = eat(); break }
        if (v.t === 'OR' || v.t === 'AND') { eat(); continue }
        if (v.t !== 'word') throw new PodQueryError(`Unexpected "${v.t}" inside the list.`, spanOf(v))
        eat()
        values.push(v.value)
      }
      if (values.length === 0) {
        throw new PodQueryError('Empty list "()" — put a value inside it, or remove it.', [open.at, close.at + 1])
      }
      return { kind: 'union', field, values }
    }

    if (tok.t !== 'word') throw new PodQueryError(`Nothing after "${field}:" — add a value, or ${field}:* for any.`, head)
    eat()
    return tok.value === '*'
      ? { kind: 'any', field }
      : { kind: 'field', field, value: tok.value }
  }

  function parseTerm() {
    const tok = peek()
    if (!tok) throw new PodQueryError('Unfinished query.', null, true)
    if (tok.t === ')') throw new PodQueryError('Unmatched ")" — remove it or add the opening "(".', spanOf(tok))
    if (tok.t === 'AND' || tok.t === 'OR') throw new PodQueryError(`"${tok.t}" needs something on both sides.`, spanOf(tok))
    if (tok.t === '(') {
      throw new PodQueryError(`Brackets group the values of one field, as in ${namesOf(fields)[0]}:(a OR b).`, spanOf(tok))
    }
    if (tok.t === ':') {
      const named = namesOf(fields).slice(0, 2).map(n => `${n}:`).join(' or ')
      throw new PodQueryError(`":" needs a field name before it, like ${named}.`, spanOf(tok))
    }

    eat()
    if (peek()?.t === ':') {
      const field = tok.value.toLowerCase()
      if (!namesOf(fields).includes(field)) {
        throw new PodQueryError(`Unknown field "${tok.value}". Search ${listNames(fields)}.`, spanOf(tok))
      }
      const colon = eat()
      return parseValue(field, [tok.at, colon.at + 1])
    }
    // No colon: free text, matched against either field.
    return { kind: 'free', value: tok.value }
  }

  function parseAnd() {
    const parts = [parseTerm()]
    for (;;) {
      const tok = peek()
      if (!tok || tok.t === 'OR' || tok.t === ')') break
      if (tok.t === 'AND') {
        const op = eat()
        if (!peek()) throw new PodQueryError('"AND" needs something on both sides.', spanOf(op), true)
      }
      parts.push(parseTerm())
    }
    return parts.length === 1 ? parts[0] : { kind: 'and', parts }
  }

  function parseOr() {
    const parts = [parseAnd()]
    while (peek()?.t === 'OR') {
      const op = eat()
      if (!peek()) throw new PodQueryError('"OR" needs something on both sides.', spanOf(op), true)
      parts.push(parseAnd())
    }
    return parts.length === 1 ? parts[0] : { kind: 'or', parts }
  }

  const node = parseOr()
  if (pos < tokens.length) {
    // A stray ")" is nearly always a bracket the user forgot to open, so it
    // gets the same advice here as it does in term position.
    if (tokens[pos].t === ')') {
      throw new PodQueryError('Unmatched ")" — remove it or add the opening "(".', spanOf(tokens[pos]))
    }
    throw new PodQueryError(`Unexpected "${tokens[pos].value ?? tokens[pos].t}".`, spanOf(tokens[pos]))
  }
  return node
}

// The text without its surrounding whitespace — what to underline when the
// error is about something missing rather than something written.
function textSpan(s) {
  const start = s.length - s.trimStart().length
  const end = s.trimEnd().length
  return end > start ? [start, end] : null
}

// Non-throwing. `{ ok, node, error, span, incomplete }`, where `span` is the
// extent of the offending text and `incomplete` says the query merely ran out
// rather than went wrong. An empty query parses to a null node, which matches
// everything — an empty search box is not a filter.
export function parsePodQuery(input, fields = POD_FIELDS) {
  const ok = (node) => ({ ok: true, node, error: null, span: null, incomplete: false })
  const tokens = tokenize(input)
  if (tokens.length === 0) return ok(null)
  try {
    return ok(parseTokens(tokens, fields))
  } catch (e) {
    if (e instanceof PodQueryError) {
      return {
        ok: false,
        node: null,
        error: e.message,
        span: e.span ?? textSpan(input ?? ''),
        incomplete: e.incomplete,
      }
    }
    throw e
  }
}

// ---------- Display ----------

// Splits the raw text into coloured segments, covering every character
// including whitespace so a mirror layer can reproduce the input exactly.
// An <input> cannot render spans, so the field is drawn twice: this underneath,
// and a transparent input on top carrying the caret and the selection.
//
// `field` is only claimed once the colon is there. Colouring `pod` before the
// user has typed `:` would promise a field search they have not asked for yet,
// and would flicker on every word that merely starts like one.
//
// `span` marks a run of characters as `bad`, which the field draws with a
// squiggle. Splitting it in here rather than in the component keeps the mirror
// layer's one invariant: the segments still concatenate back to the input.
export function segmentQuery(input, fields = POD_FIELDS, span = null) {
  const s = input ?? ''
  const out = []
  const push = (text, type) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last && last.type === type) last.text += text
    else out.push({ text, type })
  }

  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { push(c, 'plain'); i++; continue }
    if (c === '(' || c === ')') { push(c, 'paren'); i++; continue }
    if (c === ':') { push(c, 'plain'); i++; continue }

    const start = i
    while (i < s.length && isWordChar(s[i])) i++
    const word = s.slice(start, i)
    const upper = word.toUpperCase()

    if (upper === 'AND' || upper === 'OR') { push(word, 'op'); continue }
    if (s[i] === ':' && namesOf(fields).includes(word.toLowerCase())) {
      push(word + ':', 'field')
      i++
      continue
    }
    push(word, 'plain')
  }
  return span ? markSpan(out, span) : out
}

// Re-cuts the segments at the span's edges. A span can start or end mid-segment
// — `pod:` is one segment and only its colon may be at fault — so each segment
// yields up to three pieces.
function markSpan(segs, [from, to]) {
  const out = []
  const push = (text, type, bad) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last && last.type === type && !!last.bad === bad) last.text += text
    else out.push(bad ? { text, type, bad: true } : { text, type })
  }
  let at = 0
  for (const seg of segs) {
    const len = seg.text.length
    const a = Math.min(Math.max(from - at, 0), len)
    const b = Math.min(Math.max(to - at, 0), len)
    push(seg.text.slice(0, a), seg.type, false)
    push(seg.text.slice(a, b), seg.type, true)
    push(seg.text.slice(b), seg.type, false)
    at += len
  }
  return out
}

// ---------- Matching ----------

const valueOf = (row, fields, name) => String(row?.[keyFor(fields, name)] ?? '')
const has = (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase())

export function matchesPod(node, row, fields = POD_FIELDS) {
  if (!node) return true
  switch (node.kind) {
    case 'and':   return node.parts.every(p => matchesPod(p, row, fields))
    case 'or':    return node.parts.some(p => matchesPod(p, row, fields))
    case 'any':   return valueOf(row, fields, node.field).length > 0
    case 'field': return has(valueOf(row, fields, node.field), node.value)
    case 'union': return node.values.some(v => has(valueOf(row, fields, node.field), v))
    case 'free':  return namesOf(fields).some(n => has(valueOf(row, fields, n), node.value))
    default:      return true
  }
}

// The strings to highlight in each column. A free-text term highlights in both,
// a field term only in its own — so the highlight explains which clause matched
// rather than just colouring anything that looks similar.
export function highlightsFor(node, fields = POD_FIELDS, out = null) {
  const acc = out ?? Object.fromEntries(namesOf(fields).map(n => [n, []]))
  if (!node) return acc
  switch (node.kind) {
    case 'and':
    case 'or':
      node.parts.forEach(p => highlightsFor(p, fields, acc))
      break
    case 'field':
      acc[node.field]?.push(node.value)
      break
    case 'union':
      acc[node.field]?.push(...node.values)
      break
    case 'free':
      namesOf(fields).forEach(n => acc[n].push(node.value))
      break
    default:
      break   // `any` has no text to highlight
  }
  // Longest first, so an overlapping short term cannot chop a longer match.
  for (const n of namesOf(fields)) {
    acc[n] = [...new Set(acc[n])].sort((a, b) => b.length - a.length)
  }
  return acc
}

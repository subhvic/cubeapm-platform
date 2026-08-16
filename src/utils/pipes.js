// Log-query pipes — data model, serializer, validator.
// Emits CubeAPM canonical syntax, matched byte-for-byte to the playground
// Explore Builder (playground.cubeapm.com/explore → Logs → Builder) and the
// docs at docs.cubeapm.com/logs/querying.

let idSeed = 0
export function newId() { return `p_${++idSeed}` }

// ---------- Stats function catalog ----------
// `needsField`: function is meaningless without a field arg
// `needsNumeric`: field arg must be numeric (avg/sum/etc.)
// `extra`: named extra parameter shown as its own input in the UI
export const STAT_FUNCTIONS = [
  { fn: 'count',       needsField: false, needsNumeric: false, category: 'Count' },
  { fn: 'count_empty', needsField: false, needsNumeric: false, category: 'Count' },
  { fn: 'count_uniq',  needsField: true,  needsNumeric: false, category: 'Count' },
  { fn: 'avg',         needsField: true,  needsNumeric: true,  category: 'Numeric' },
  { fn: 'sum',         needsField: true,  needsNumeric: true,  category: 'Numeric' },
  { fn: 'min',         needsField: true,  needsNumeric: true,  category: 'Numeric' },
  { fn: 'max',         needsField: true,  needsNumeric: true,  category: 'Numeric' },
  { fn: 'median',      needsField: true,  needsNumeric: true,  category: 'Numeric' },
  { fn: 'quantile',    needsField: true,  needsNumeric: true,  category: 'Numeric', extra: 'p' },
]

export const STAT_FN_BY_NAME = Object.fromEntries(STAT_FUNCTIONS.map(f => [f.fn, f]))

// ---------- Factories ----------

export function newStatsFunction(overrides = {}) {
  return {
    id: newId(),
    fn: 'count',
    p: 0.9,      // meaningful only when fn === 'quantile'
    field: '',
    if: '',
    as: '',
    ...overrides,
  }
}

export function newStatsPipe(overrides = {}) {
  return {
    id: newId(),
    kind: 'stats',
    groupBy: [],
    functions: [newStatsFunction()],
    ...overrides,
  }
}

export function newMathPipe(overrides = {}) {
  return { id: newId(), kind: 'math', expression: '', as: '', ...overrides }
}

export function newSortPipe(overrides = {}) {
  return { id: newId(), kind: 'sort', field: '', dir: 'desc', ...overrides }
}

export function newLimitPipe(overrides = {}) {
  return { id: newId(), kind: 'limit', n: 100, ...overrides }
}

// ---------- Serialization ----------
// Rules confirmed against the playground:
//   • group-by field names always double-quoted
//   • stats `as` names always double-quoted
//   • quantile keeps trailing comma when field arg is empty: quantile(0.9, )
//   • functions in a stats pipe are comma-joined with ", "
//   • math `as` names emitted unquoted (per docs) when a valid identifier
//   • sort field always double-quoted; direction omitted when asc (default)

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function quoteName(name) {
  return IDENT_RE.test(name) ? name : `"${name.replace(/"/g, '\\"')}"`
}

function serializeStatsFn(f) {
  const args = []
  if (f.fn === 'quantile') args.push(String(f.p ?? 0.9))
  args.push(f.field || '')
  let s = `${f.fn}(${args.join(', ')})`
  if (f.if && f.if.trim()) s += ` if (${f.if.trim()})`
  if (f.as && f.as.trim()) s += ` as "${f.as.trim()}"`
  return s
}

function serializeStats(pipe) {
  // Skip entirely if there are no functions — an orphan `stats by (…)` with
  // no aggregations is invalid CubeAPM syntax and would fail on run.
  const fns = (pipe.functions || []).map(serializeStatsFn).join(', ')
  if (!fns) return ''
  let head = 'stats'
  if (pipe.groupBy && pipe.groupBy.length > 0) {
    head += ` by (${pipe.groupBy.map(f => `"${f}"`).join(', ')})`
  }
  return `${head} ${fns}`
}

function serializeMath(pipe) {
  const expr = (pipe.expression || '').trim()
  const as = (pipe.as || '').trim()
  if (!expr) return 'math'
  return as ? `math ${expr} as ${quoteName(as)}` : `math ${expr}`
}

function serializeSort(pipe) {
  const f = (pipe.field || '').trim()
  if (!f) return 'sort'
  const dir = pipe.dir === 'asc' ? '' : ' desc'
  return `sort ("${f}")${dir}`
}

function serializeLimit(pipe) {
  const n = Number.isFinite(pipe.n) ? Math.max(1, Math.floor(pipe.n)) : 100
  return `limit ${n}`
}

export function serializePipe(pipe) {
  switch (pipe?.kind) {
    case 'stats': return serializeStats(pipe)
    case 'math':  return serializeMath(pipe)
    case 'sort':  return serializeSort(pipe)
    case 'limit': return serializeLimit(pipe)
    default:      return ''
  }
}

// Pipe section of a full query. No leading separator; caller composes with
// the conditions string via composeQuery.
export function serializePipes(pipes) {
  return (pipes || []).map(serializePipe).filter(Boolean).join(' | ')
}

// Composes conditions + pipes into a full CubeAPM query. When conditions are
// empty and pipes exist, the leading `*` (match-all) is inserted so the pipe
// section has an input to operate on — matching the playground's behavior.
export function composeQuery(conditionsStr, pipes) {
  const cond = (conditionsStr || '').trim()
  const pstr = serializePipes(pipes)
  if (!pstr) return cond
  const head = cond || '*'
  return `${head} | ${pstr}`
}

// ---------- Validation ----------
// Returns [{ path, msg }]. Empty array = valid. Pass numericFields to enable
// numeric-field checks for avg/sum/etc.

export function validatePipe(pipe, opts = {}) {
  const numericFields = opts.numericFields || new Set()
  const errors = []
  if (pipe.kind === 'stats') {
    if (!pipe.functions || pipe.functions.length === 0) {
      errors.push({ path: 'functions', msg: 'Add at least one aggregation.' })
    }
    ;(pipe.functions || []).forEach((f, i) => {
      const meta = STAT_FN_BY_NAME[f.fn]
      if (!meta) {
        errors.push({ path: `functions[${i}].fn`, msg: `Unknown function "${f.fn}".` })
        return
      }
      if (meta.needsField && !f.field) {
        errors.push({ path: `functions[${i}].field`, msg: `${f.fn} needs a field.` })
      }
      if (meta.needsNumeric && f.field && !numericFields.has(f.field)) {
        errors.push({ path: `functions[${i}].field`, msg: `${f.fn} needs a numeric field.` })
      }
      if (f.fn === 'quantile') {
        const n = Number(f.p)
        if (!(n >= 0 && n <= 1)) {
          errors.push({ path: `functions[${i}].p`, msg: 'Percentile must be between 0 and 1.' })
        }
      }
      if (f.as && !IDENT_RE.test(f.as)) {
        errors.push({ path: `functions[${i}].as`, msg: 'Name must start with a letter or underscore.' })
      }
    })
    const seen = new Set()
    ;(pipe.functions || []).forEach((f, i) => {
      if (f.as && seen.has(f.as)) {
        errors.push({ path: `functions[${i}].as`, msg: `Duplicate name "${f.as}".` })
      }
      if (f.as) seen.add(f.as)
    })
  } else if (pipe.kind === 'math') {
    if (!pipe.expression?.trim()) {
      errors.push({ path: 'expression', msg: 'Expression is required.' })
    }
    if (pipe.as && !IDENT_RE.test(pipe.as)) {
      errors.push({ path: 'as', msg: 'Name must start with a letter or underscore.' })
    }
    let depth = 0
    for (const ch of pipe.expression || '') {
      if (ch === '(') depth++
      else if (ch === ')') depth--
      if (depth < 0) break
    }
    if (depth !== 0) {
      errors.push({ path: 'expression', msg: 'Unbalanced parentheses.' })
    }
  } else if (pipe.kind === 'sort') {
    if (!pipe.field) errors.push({ path: 'field', msg: 'Choose a field to sort by.' })
  } else if (pipe.kind === 'limit') {
    const n = Number(pipe.n)
    if (!(Number.isFinite(n) && n > 0)) {
      errors.push({ path: 'n', msg: 'Limit must be a positive number.' })
    }
  }
  return errors
}

export function validatePipes(pipes, opts) {
  return (pipes || []).map(p => ({ id: p.id, errors: validatePipe(p, opts) }))
}

// ---------- Scope helpers ----------
// Names in scope for a math expression, produced by any preceding stats pipe.
// Used by the UI's "Available names" helper and by the (soft) reference check.
export function namesInScopeBefore(pipes, index) {
  const names = []
  for (let i = 0; i < index; i++) {
    const p = pipes[i]
    if (p.kind === 'stats') {
      for (const f of p.functions || []) {
        if (f.as) names.push(f.as)
      }
    } else if (p.kind === 'math' && p.as) {
      names.push(p.as)
    }
  }
  return names
}

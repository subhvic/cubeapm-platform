# CubeAPM Table Search — integration package

Searching the rows of a table, in two variants that share one field. Plain text over a single
column; a small query language — fields, `AND`/`OR`, unions — over several.

Three things travel together:

| | |
|---|---|
| **Live prototype** | _(paste the Vercel URL here)_ → `/` for the single-field variant, Infrastructure → Kubernetes → Pod for the query variant |
| **Handoff document** | https://claude.ai/code/artifact/e32116ce-d267-4084-bdd2-9ed348b64dd9 |
| **This package** | the code, its tests, and its tokens |

---

## Verified before packaging

- **35 tests pass from inside this folder**, using only the files here.
- **Every `@/` and relative import resolves within the package** — checked mechanically.
- **Every copy is byte-identical to its source.** The one exception is `src/examples/`, written for
  this package and labelled as such.
- External packages: `react`, `react-dom`. **That is the whole list** — no icon library, no `clsx`.
  The magnifier, the clear ×, and the syntax colouring are all inline SVG and CSS.

```bash
npm install
npm test
```

---

## The one thing to understand first

**Pick the variant by how many columns the table can be searched on.**

| | `TableSearch` | `TableQuerySearch` |
|---|---|---|
| Columns | one | two or more |
| What you type | text | text, or `pod:redis AND namespace:default` |
| Who owns the text | the parent (`value` / `onChange`) | the field (`onApply` hands up a query) |
| Filtering | substring, as you type | parsed, as you type |

A single-column table has nothing to disambiguate, so a query language there would be ceremony
around a substring match — `pod:redis` in a table of pods says nothing that `redis` does not. Two
columns is where a syntax starts earning its place, because "redis" could mean either of them.

Both variants share the `.svc-search` shell, so a table gains or loses the syntax without the field
changing shape.

---

## What's here

Paths mirror the original repo, so the `@/` alias resolves unchanged.

| Path | Lines | Role |
|---|---:|---|
| `src/utils/tableQuery.js` | 342 | **The language**: tokenizer, parser, matcher, colouring, placeholder. Start here. |
| `src/components/TableQuerySearch.jsx` | 126 | The query variant — the field, the squiggle, the timing |
| `src/components/TableSearch.jsx` | 46 | The plain variant. Deliberately this short. |
| `src/utils/highlight.jsx` | 17 | `highlightTerms` — wraps matches in `<mark>`. Shared with the logs table. |
| `src/utils/tableQuery.test.js` | 304 | 35 tests — the specification |
| `src/examples/TableSearchDemo.jsx` | 128 | **Written for this package.** Both variants wired to one small table. |
| `src/index.css` | 3645 | Full stylesheet — see the classes below |
| `tailwind.config.js` | | Design tokens, unchanged from the app |

### The classes this surface owns

| Prefix | What |
|---|---|
| `.svc-search`, `.svc-search-clear` | the shell both variants share, and its × |
| `.pod-search-wrap`, `.pod-search-field` | the query variant's wrapper |
| `.pod-search-ink`, `.pod-search-ink-wrap` | the colour layer under the input |
| `.pod-ink-field`, `-op`, `-paren`, `-plain`, `-bad` | the syntax colours, and the error squiggle |
| `.pod-search-error` | the sentence under the field |
| `.svc-hit` | a highlighted match (shares its rule with the logs table's `.log-hit`) |
| `.svc-empty-row`, `.pod-empty-row` | "No data matches …" |
| `.panel-head.is-stacked`, `.panel-head-row` | title and hint on one row, field full-width beneath |

The `.pod-` prefix is historical — the query variant was built for the pod tables before it was
generalised. Renaming it is safe and touches only this stylesheet and these two components.

---

## Wiring it

### Single field

```jsx
const [search, setSearch] = useState('')
const term = search.trim()
const shown = useMemo(() => (
  term ? rows.filter(r => r.name.toLowerCase().includes(term.toLowerCase())) : rows
), [term])

<TableSearch value={search} onChange={setSearch} placeholder="Search service" />
...
{term ? highlightTerms(row.name, [term], 'svc-hit') : row.name}
```

### Several fields

```jsx
const [query, setQuery] = useState('')

const { node, ok } = parsePodQuery(query, FIELDS)
const shown = useMemo(() => (ok ? rows.filter(r => matchesPod(node, r, FIELDS)) : rows), [node, ok])
const hits  = useMemo(() => (ok ? highlightsFor(node, FIELDS) : {}), [node, ok])

<TableQuerySearch onApply={setQuery} fields={FIELDS} />
...
<span>{highlightTerms(row.name,      hits.pod,       'svc-hit')}</span>
<span>{highlightTerms(row.namespace, hits.namespace, 'svc-hit')}</span>
```

`ok` is belt-and-braces: the field only ever hands up a query that parsed. Keep the guard anyway —
it costs nothing and it means a caller who sets the query from a URL or a saved view cannot blank
the table with a bad string.

### The field set is the whole configuration

```js
const FIELDS = [
  { name: 'pod',       key: 'name' },      // what the user types, and the row property it reads
  { name: 'namespace', key: 'namespace' },
]
```

`name` and `key` differ more often than not — the pod column reads a row's `name`. Everything else
follows from this list: which fields parse, what an unknown-field error offers instead, which
columns free text searches, and the placeholder. **Adding a searchable column is one line here.**

There is no `placeholder` prop, deliberately. It is generated — `Search pod, namespace or node
( eg. pod:abc AND namespace:def )` — so every multi-column table advertises the same form and
adding a column cannot leave a stale example behind. If you need a different phrasing, change
`placeholderFor`, not the call sites.

---

## The language

```
payment                          both fields, substring
pod:payment                      one field
namespace:*                      the field has any value
pod:(redis OR coredns)           a union — one field, several values
pod:redis AND namespace:default
pod:redis OR pod:coredns
```

`AND` binds tighter than `OR`, which is what every other query language does and therefore what
someone typing `a OR b AND c` expects. Field names and operators are case-insensitive; values are
matched as case-insensitive substrings.

**This is deliberately not the logs query builder.** That one is a chip tree with pipes and an
operator catalogue; a two- or three-column table does not earn it. If a table ever needs ranges,
negation or `in (…)`, that is the signal to reach for the logs builder rather than to grow this.

---

## Six rules worth keeping

1. **Everything filters as you type.** No Enter, no search button. This is the redesign's rule 5 —
   never make someone click Search to see anything — and it applies to a query just as much as to
   a word.
2. **A query that does not parse is never applied.** The rows go on answering the last text that
   did. Half of `pod:(a OR` is malformed by definition; emptying the table under someone mid-clause
   punishes them for typing.
3. **Errors arrive in two strengths.** A squiggle marks the characters at fault — the exact token,
   not the line — after a pause in typing. The sentence explaining it waits longer.
4. **A query that merely ran out says nothing until you leave the field.** `pod:`, `pod:(redis`, a
   trailing `AND` — the person is deciding what to search for, not making a mistake. A query that
   is *wrong* (unknown field, stray `)`) explains itself straight away, because more typing on the
   end will not repair it. The parser reports which is which as `incomplete`; the component does
   not guess from the message text.
5. **The field itself never turns red.** Two bad characters do not make the whole search broken.
6. **Filtering only removes rows.** Severity order survives it — a search must never be the thing
   that quietly re-sorts a list. On Home this matters most: services are sorted critical-first at
   the data layer, and filtering preserves it.

---

## Acceptance criteria

| Suite | Tests | Covers |
|---|---:|---|
| `src/utils/tableQuery.test.js` | 35 | The language, its errors, the display segments, and the placeholder |

Four properties in there are contracts rather than examples, and are worth keeping if you rewrite
anything:

- **The segments concatenate back to the input, exactly.** The field draws its text twice — a
  coloured layer under a transparent input carrying the caret — and the two copies drift apart the
  moment that stops being true.
- **Every error has a span to underline.** An error without one would draw no squiggle: a silent
  failure in the one place it matters. Errors with nothing to point at fall back to the whole line.
- **`incomplete` splits ran-out from went-wrong**, which is what rule 4 above is built on.
- **The placeholder's worked example parses** — pulled back out of the generated placeholder and
  run, rather than copied into the test where it could go stale.

---

## Not built, on purpose

- **No suggestion overlay.** There was one; it was removed. The field is one line of text and the
  panel covered the rows being filtered, which cost more than it taught. The placeholder's worked
  example carries the syntax instead. If you bring a panel back, put it somewhere that does not
  obscure the result of what is being typed.
- **No debounce on the apply.** This filters arrays in memory, so per-keystroke is free. **Against a
  real API it is one request per character** — add a debounce there, and note it is a *different*
  debounce from the 500 ms one that delays the error message.
- **No persistence, no URL state.** The query lives in the parent's React state and is lost on
  reload. Sharing a filtered table by URL is the obvious next thing, and the query is already a
  plain string, so it is a serialisation away.
- **No server-side filtering.** `matchesPod` walks rows in memory. For tables of a few hundred rows
  that is right; past that, the parsed node is a tree that maps cleanly onto a backend filter.

---

Packaged from the table-search extraction. Where this README and the code disagree, the code is right.

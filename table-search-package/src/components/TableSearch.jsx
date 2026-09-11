// The simple variant of table search: one searchable column.
//
// It used to be plain text and nothing else, on the reasoning that a single
// column has nothing to disambiguate and a query language there would be
// ceremony around a substring match. Tags changed that. A column carrying
// `team` and `tier` is several things to search even though it is one column,
// and `service.team:alpha` is not expressible as a substring of anything.
//
// So both variants now speak the same language, and what separates them is
// only how much of it there is to use: with one column the field prefix is
// optional in practice, most queries are still a word, and the syntax earns
// its place on the tags.
//
// The field itself is TableQuerySearch — one implementation, so the colouring,
// the error timing and the parser cannot drift apart between the two variants.

import TableQuerySearch from '@/components/TableQuerySearch'
import { SERVICE_FIELDS } from '@/utils/tableQuery'

export default function TableSearch({ onApply, fields = SERVICE_FIELDS }) {
  return <TableQuerySearch onApply={onApply} fields={fields} />
}

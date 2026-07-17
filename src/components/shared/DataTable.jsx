import { useState } from 'react'
import { clsx } from 'clsx'
import { ChevronDown, ChevronUp } from 'lucide-react'

/**
 * Sortable data table with right-aligned numerics, row hover, status-colored values.
 * Columns: { key, label, align?, render?, sortable? }
 */
export default function DataTable({ columns, data, onRowClick, emptyMessage = 'No data' }) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey]
        const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      })
    : data

  if (!data.length) {
    return (
      <div className="flex items-center justify-center py-12 text-text-muted text-body">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          <tr className="border-b border-border-subtle">
            {columns.map(col => (
              <th
                key={col.key}
                className={clsx(
                  'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap',
                  col.align === 'right' ? 'text-right' : 'text-left',
                  col.sortable !== false && 'cursor-pointer select-none hover:text-text-secondary transition-colors'
                )}
                onClick={() => col.sortable !== false && handleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key && (
                    sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.id || row.key || i}
              className={clsx(
                'border-b border-border-subtle last:border-b-0 transition-colors',
                onRowClick ? 'cursor-pointer hover:bg-panel-2' : 'hover:bg-panel-2/50'
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  className={clsx(
                    'px-4 py-2.5 whitespace-nowrap',
                    col.align === 'right' ? 'text-right font-mono' : 'text-left'
                  )}
                >
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

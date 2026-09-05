'use client'

import { useMemo, useState } from 'react'
import { EmptyState, SearchFilterField, SelectFilterField, StatCard, StatGrid } from '@/lib/ui'
import { formatMark, markPercent, weightedAveragePercent } from '@/lib/grades'

export type GradecardMark = {
  className: string
  topic: string | null
  title: string
  score: number
  maxMarks: number | null
}

type SortKey = 'class' | 'highest' | 'lowest'

/**
 * The student's grade card: a live, filterable table of their marks. The class
 * filter, search and sort all run in the browser over the loaded marks, and the
 * average + count recompute for whatever's shown - so it's dynamic, not a fixed
 * snapshot.
 */
export function Gradecard({ marks }: { marks: GradecardMark[] }) {
  const [className, setClassName] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('class')

  const classes = useMemo(() => [...new Set(marks.map((m) => m.className))].sort(), [marks])

  const filtered = useMemo(() => {
    let out = marks
    if (className) out = out.filter((m) => m.className === className)
    const term = query.trim().toLowerCase()
    if (term) {
      out = out.filter((m) => m.title.toLowerCase().includes(term) || (m.topic ?? '').toLowerCase().includes(term))
    }
    const sorted = [...out]
    if (sort === 'highest') {
      sorted.sort((a, b) => (markPercent(b.score, b.maxMarks) ?? -1) - (markPercent(a.score, a.maxMarks) ?? -1))
    } else if (sort === 'lowest') {
      sorted.sort((a, b) => (markPercent(a.score, a.maxMarks) ?? 101) - (markPercent(b.score, b.maxMarks) ?? 101))
    } else {
      sorted.sort((a, b) => a.className.localeCompare(b.className) || a.title.localeCompare(b.title))
    }
    return sorted
  }, [marks, className, query, sort])

  const average = weightedAveragePercent(filtered)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <SelectFilterField
          label="Class"
          className="min-w-0"
          value={className}
          onChange={(e) => setClassName(e.target.value)}
        >
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectFilterField>
        <SearchFilterField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Assignment or topic..."
        />
        <SelectFilterField label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="class">By class</option>
          <option value="highest">Highest first</option>
          <option value="lowest">Lowest first</option>
        </SelectFilterField>
      </div>

      <StatGrid cols={3}>
        <StatCard
          label="Average"
          value={average == null ? '-' : `${Math.round(average)}%`}
          tone="primary"
          sub="of shown grades"
        />
        <StatCard label="Grades shown" value={filtered.length} sub={`of ${marks.length} total`} />
        <StatCard label="Classes" value={className ? 1 : classes.length} />
      </StatGrid>

      {filtered.length === 0 ? (
        <EmptyState>No grades match these filters.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className="text-left">
                  Class
                </th>
                <th scope="col" className="text-left">
                  Assignment
                </th>
                <th scope="col" className="text-left">
                  Score
                </th>
                <th scope="col" className="text-left">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => {
                const pct = markPercent(m.score, m.maxMarks)
                const rowKey = `${m.className}:${m.title}:${m.topic ?? ''}:${m.score}:${m.maxMarks ?? 'na'}:${i}`
                return (
                  <tr key={rowKey}>
                    <td className="whitespace-nowrap text-slate-600">{m.className}</td>
                    <td className="text-slate-800">
                      {m.title}
                      {m.topic && <span className="ml-1 text-xs text-slate-600">- {m.topic}</span>}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-slate-700">{formatMark(m.score, m.maxMarks)}</td>
                    <td className="whitespace-nowrap tabular-nums text-slate-600">{pct == null ? '-' : `${pct}%`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

import { ARCHIVED_ROW } from './core'

type ArchivedListItem = {
  key: string
  label: React.ReactNode
  meta?: React.ReactNode
  action?: React.ReactNode
}

export function ArchivedList({
  count,
  singularLabel,
  pluralLabel,
  items,
}: {
  count: number
  singularLabel: string
  pluralLabel?: string
  items: readonly ArchivedListItem[]
}) {
  if (count === 0 || items.length === 0) return null

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-primary">
        {count} {count === 1 ? singularLabel : (pluralLabel ?? `${singularLabel}s`)}
      </summary>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.key} className={ARCHIVED_ROW}>
            <span className="min-w-0 flex-1 truncate text-slate-500">{item.label}</span>
            {item.meta && <span className="shrink-0 text-xs text-slate-400">{item.meta}</span>}
            {item.action}
          </li>
        ))}
      </ul>
    </details>
  )
}

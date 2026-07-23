import type { ReactNode } from 'react'
import Link from 'next/link'
import { CARD, cx } from './core'

/* The shared "record row" pattern used by every list page. */

/** The "go to this record" chevron shown on a clickable ListRow / card, sliding
 *  and colouring on the row's group-hover. */
export function RowChevron({ className = '' }: { className?: string }) {
  return (
    <svg
      className={cx(
        'h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-primary',
        className,
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** A standard list row: leading media (avatar/icon), title + subtitle, and an
 *  optional trailing slot. Pass `href` to make the whole row a lift-on-hover
 *  link (the common "open this record" pattern); omit it for a static row. */
export function ListRow({
  href,
  leading,
  title,
  subtitle,
  trailing,
  className = '',
}: {
  href?: string
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  className?: string
}) {
  // A clickable row with no explicit trailing gets a subtle hover chevron - the
  // shared "open this" affordance, so pages no longer hand-write "View ->" text.
  const end = trailing ?? (href ? <RowChevron /> : null)
  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{title}</p>
        {subtitle != null && <p className="truncate text-xs text-slate-400">{subtitle}</p>}
      </div>
      {end}
    </>
  )
  if (href) {
    return (
      <Link
        href={href}
        className={cx(
          CARD,
          'group flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:shadow-md',
          className,
        )}
      >
        {body}
      </Link>
    )
  }
  return <div className={cx(CARD, 'flex items-center gap-3 p-3', className)}>{body}</div>
}

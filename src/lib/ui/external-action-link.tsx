import { cx } from './core'
import { safeActionHref } from '@/lib/validation/url'

export function ExternalActionLink({
  href,
  className = '',
  title,
  children,
}: {
  href: string
  className?: string
  title?: string
  children: React.ReactNode
}) {
  // Opens in a new tab: a stored http(s) link, or one of this app's own download/PDF routes.
  // Never emit an href for anything else (javascript:, data:, //host, ...): stored links are
  // rendered for another user to click, so an unsafe value is a stored-XSS vector. Fall back
  // to inert text when the value isn't safe.
  const safe = safeActionHref(href)
  if (!safe) {
    return (
      <span className={cx('btn btn-sm btn-soft opacity-60', className)} title={title}>
        {children}
      </span>
    )
  }
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={cx('btn btn-sm btn-soft', className)}
      title={title}
    >
      {children}
    </a>
  )
}

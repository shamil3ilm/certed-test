import { cx } from './core'
import { safeExternalHref } from '@/lib/validation/url'

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
  // Never emit an href for a non-http(s) value (javascript:, data:, ...): these are
  // stored links rendered for another user to click, so an unsafe scheme is a
  // stored-XSS vector (A-03). Fall back to inert text when the URL isn't safe.
  const safe = safeExternalHref(href)
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

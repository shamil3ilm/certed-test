import { cx } from './core'

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
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx('btn btn-sm btn-soft', className)}
      title={title}
    >
      {children}
    </a>
  )
}

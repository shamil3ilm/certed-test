import type { ReactNode } from 'react'

/**
 * Sign-out control. Posts to /api/logout (a POST, so a cross-site
 * `<img src=".../api/logout">` can't force a logout the way a GET could) while
 * rendering as the button/link it replaces. `display:contents` on the form keeps
 * the button in the parent's flex/grid flow, so styling is unchanged.
 */
export function LogoutForm({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <form action="/api/logout" method="post" className="contents">
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  )
}

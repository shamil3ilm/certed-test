import type { ReactNode } from 'react'

/**
 * Line icons keyed by nav href, so the portal nav reads as a purpose-built
 * product surface rather than a plain text row. Simple geometric shapes stay
 * crisp at 16-20px and are easy to maintain; unknown hrefs render nothing.
 */
const ICONS: Record<string, ReactNode> = {
  '/dashboard': (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  '/messages': <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
  '/classroom': (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5V5.5Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 0 1.5-1.5V5.5Z" />
    </>
  ),
  '/calendar': (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9h17M8 3v4M16 3v4" />
    </>
  ),
  '/grading': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  '/students': (
    <>
      <circle cx="8" cy="9" r="3" />
      <path d="M2.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 7.5a3 3 0 0 1 0 6M21.5 19a5.5 5.5 0 0 0-4-5.3" />
    </>
  ),
  '/payslips': (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h5M8 17h3" />
    </>
  ),
  '/receipts': (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h5" />
    </>
  ),
  '/admin/users': (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M17 8.5a2.5 2.5 0 0 1 0 5M20.5 19a5 5 0 0 0-3.5-4.8" />
    </>
  ),
  '/admin/finance': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v10M14.5 9.3c-.6-.8-1.6-1.3-2.7-1.3-1.5 0-2.8.9-2.8 2.2 0 1.4 1.3 1.8 2.8 2.1 1.5.3 2.8.7 2.8 2.1 0 1.3-1.3 2.2-2.8 2.2-1.1 0-2.1-.5-2.7-1.3" />
    </>
  ),
  '/admin/history': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
}

export function NavIcon({ href, className = 'h-[18px] w-[18px]' }: { href: string; className?: string }) {
  const icon = ICONS[href]
  if (!icon) return null
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon}
    </svg>
  )
}

import { cx } from './core'

/* Visual identity helpers: how a person or a class is represented (initials,
 * role tint, class banner). Presentation only - no domain rules. */

/** Two-letter initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

/** Role -> tone class strings (avatar chip, comment bubble, text badge). */
export function roleTone(role?: string | null): { avatar: string; bubble: string; badge: string } {
  if (role === 'admin')
    return {
      avatar: 'bg-violet-100 text-violet-700 border-violet-200',
      bubble: 'bg-violet-50 border-violet-200',
      badge: 'bg-violet-100 text-violet-800 border-violet-200',
    }
  if (role === 'sub_admin')
    return {
      avatar: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      bubble: 'bg-indigo-50 border-indigo-200',
      badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    }
  if (role === 'mentor')
    return {
      avatar: 'bg-amber-100 text-amber-700 border-amber-200',
      bubble: 'bg-amber-50 border-amber-200',
      badge: 'bg-amber-100 text-amber-800 border-amber-200',
    }
  if (role === 'tutor')
    return {
      avatar: 'bg-sky-100 text-sky-700 border-sky-200',
      bubble: 'bg-sky-50 border-sky-200',
      badge: 'bg-sky-100 text-sky-800 border-sky-200',
    }
  return {
    avatar: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    bubble: 'bg-emerald-50 border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  }
}

/** Deterministic on-brand gradient for a class banner, keyed by class id. */
const CLASS_BANNERS = [
  'from-primary to-secondary',
  'from-secondary to-primary',
  'from-sky-500 to-primary',
  'from-primary to-emerald-500',
  'from-violet-500 to-primary',
  'from-secondary to-teal-500',
]

export function classBanner(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffff
  return CLASS_BANNERS[h % CLASS_BANNERS.length]
}

/** Round initials chip, tinted by the member's role. */
export function Avatar({
  name,
  role,
  size = 'md',
  className = '',
}: {
  name: string
  role?: string | null
  size?: 'sm' | 'md'
  className?: string
}) {
  const dims = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-sm'
  return (
    <span
      className={cx(
        'grid shrink-0 place-items-center rounded-full border font-semibold',
        dims,
        roleTone(role).avatar,
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

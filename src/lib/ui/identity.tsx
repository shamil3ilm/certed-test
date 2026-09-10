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
      avatar: 'bg-primary/15 text-primary border-primary/30',
      bubble: 'bg-primary/5 border-primary/20',
      badge: 'bg-primary/15 text-primary border-primary/30',
    }
  if (role === 'sub_admin')
    return {
      avatar: 'bg-secondary-ink/15 text-secondary-ink border-secondary-ink/30',
      bubble: 'bg-secondary-ink/5 border-secondary-ink/20',
      badge: 'bg-secondary-ink/15 text-secondary-ink border-secondary-ink/30',
    }
  if (role === 'mentor')
    return {
      avatar: 'bg-warning-tint text-warning-ink border-warning-border',
      bubble: 'bg-warning-surface border-warning-border',
      badge: 'bg-warning-tint text-warning-ink border-warning-border',
    }
  if (role === 'tutor')
    return {
      avatar: 'bg-slate-100 text-slate-700 border-slate-200',
      bubble: 'bg-slate-50 border-slate-200',
      badge: 'bg-slate-100 text-slate-700 border-slate-200',
    }
  return {
    avatar: 'bg-success-tint text-success-ink border-success-border',
    bubble: 'bg-success-surface border-success-border',
    badge: 'bg-success-tint text-success-ink border-success-border',
  }
}

/**
 * Deterministic on-brand gradient for a class banner, keyed by class id.
 *
 * BRAND TOKENS ONLY. Every colour here is one of the four in globals.css - a class card is
 * a large, repeated block of colour, so borrowing Tailwind's indigo/violet/rose/teal put
 * hues on screen that appear nowhere else in the product and read as a different brand.
 * Variety comes from which brand blues are paired and in which direction, not from adding
 * colours.
 *
 * Three rules, all enforced by tests/unit/class-banner-contrast.test.ts:
 *
 *  - Only `primary`, `primary-strong`, `secondary` and `secondary-ink` may appear.
 *  - The gradient runs top-left to bottom-right and the card's white title and subtitle sit
 *    at the TOP-LEFT, so the `from-` colour is what that text is read against and must
 *    carry white at 4.5:1. That is why `secondary` (#50b5e1, 2.32:1 against white) is only
 *    ever a `to-` colour: it is the decorative end, where no text reaches.
 *  - No entry may be another reversed. The same two colours flipped read as a rendering
 *    fault rather than variety, because nothing about the card explains the difference.
 */
const CLASS_BANNERS = [
  'from-primary to-secondary',
  'from-primary-strong to-secondary',
  'from-secondary-ink to-secondary',
  'from-primary to-secondary-ink',
  'from-primary-strong to-secondary-ink',
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
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const dims = size === 'sm' ? 'h-7 w-7 text-micro' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-9 w-9 text-sm'
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

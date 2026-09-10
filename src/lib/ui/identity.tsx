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
 * The class-banner gradient. ONE gradient, for every class.
 *
 * Deliberately not keyed by class id. A per-class palette gives each card a colour the
 * reader cannot attribute to anything - two classes for the same student, side by side in
 * one group, differed in a way that nothing on the card explained. And with only four brand
 * tokens the variants could not be made to look like a set: the sole LIGHT token is
 * `secondary` (L* 69.6, the rest sit between L* 22 and 45), so a gradient not ending there
 * has nowhere to travel. `primary -> secondary-ink` spanned L* 13 next to another's 47.6,
 * which read as a card that had failed to paint rather than as variety.
 *
 * A class is identified by its NAME and subject, which the card already carries. The banner
 * is brand furniture, and uniform is what furniture should be.
 *
 * Two rules, both enforced by tests/unit/class-banner-contrast.test.ts:
 *
 *  - Brand tokens only. A class card is a large, repeated block of colour, so borrowing
 *    Tailwind's indigo/violet/rose/teal puts hues on screen that appear nowhere else in the
 *    product and read as a different brand.
 *  - The gradient runs top-left to bottom-right and the card's white title and subtitle sit
 *    at the TOP-LEFT, so `from-` is what that text is read against and must carry white at
 *    4.5:1. `secondary` (#50b5e1) is 2.32:1 against white, so it can only ever be the `to-`
 *    end - the decorative corner, where no text reaches.
 */
export const CLASS_BANNER = 'from-primary to-secondary'

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

import type { ElementType, ReactNode } from 'react'

/* ----------------------------------------------------------------------------
 * Design tokens & helpers — the single source for the repeated visual patterns
 * (cards, avatars, empty states, badges, role tones, class banners). Import
 * these instead of re-typing the class strings so the look stays consistent.
 * Brand colours themselves live as CSS variables in globals.css (--primary…).
 * ------------------------------------------------------------------------- */

/** Join class names, dropping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** The standard white content-box surface (used ~35× before this existed). */
export const CARD = 'rounded-2xl border border-slate-200 bg-white shadow-sm'

/** Two-letter initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

/** Role → tone class strings (avatar chip, comment bubble, text badge). */
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
  if (role === 'teacher')
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

/** Human label for a role, from the student's point of view. */
export function roleLabel(role?: string | null): string {
  if (role === 'teacher') return 'Tutor'
  if (role === 'admin') return 'Super Admin'
  if (role === 'sub_admin') return 'Sub Admin'
  return 'Student'
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

/** White content box. `interactive` adds the standard lift-on-hover. */
export function Card({
  as: As = 'div',
  interactive = false,
  className = '',
  id,
  children,
}: {
  as?: ElementType
  interactive?: boolean
  className?: string
  id?: string
  children: ReactNode
}) {
  return (
    <As id={id} className={cx(CARD, interactive && 'transition hover:-translate-y-0.5 hover:shadow-md', className)}>
      {children}
    </As>
  )
}

/** Dashed placeholder shown when a list/section is empty. */
export function EmptyState({
  as: As = 'div',
  className = '',
  children,
}: {
  as?: ElementType
  className?: string
  children: ReactNode
}) {
  return (
    <As className={cx('rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400', className)}>
      {children}
    </As>
  )
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
    <span className={cx('grid shrink-0 place-items-center rounded-full border font-semibold', dims, roleTone(role).avatar, className)}>
      {initials(name)}
    </span>
  )
}

/** Coloured dot + label, e.g. a calendar/legend key. */
export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  )
}

/** Small status pill. */
export function Badge({
  tone = 'slate',
  className = '',
  children,
}: {
  tone?: 'slate' | 'primary' | 'success' | 'warning' | 'danger'
  className?: string
  children: ReactNode
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
  }
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>
      {children}
    </span>
  )
}

/** Consistent page title block used across all portal pages. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl lg:text-3xl">
          <span className="h-5 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-primary to-secondary sm:h-6 lg:h-7" aria-hidden />
          <span className="truncate">{title}</span>
        </h1>
        {description && <p className="mt-1 text-sm text-slate-500 sm:text-[0.95rem]">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** A bordered white content panel. */
export function Panel({
  title,
  children,
  className = '',
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>}
      {children}
    </section>
  )
}

/** A headline metric tile. */
export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string | number
  sub?: string
  tone?: 'default' | 'primary'
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        tone === 'primary' ? 'border-primary/20 bg-primary/5' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

/** Dependency-free horizontal bar chart. */
export function MiniBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  if (data.length === 0) return <p className="text-sm text-slate-400">No data yet.</p>
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-sm">
          <span className="w-32 shrink-0 truncate text-slate-500" title={d.label}>{d.label}</span>
          <div className="h-3 flex-1 rounded-full bg-slate-100">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-primary to-secondary"
              style={{ width: `${Math.round((d.value / max) * 100)}%` }}
            />
          </div>
          <span className="w-8 text-right tabular-nums text-slate-600">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

/** A simple SVG donut for a two-part (done/remaining) ratio. */
export function Donut({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total > 0 ? value / total : 0
  const r = 32
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-4">
      <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0">
        <circle cx="42" cy="42" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="42" cy="42" r={r} fill="none" stroke="var(--primary)" strokeWidth="10"
          strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 42 42)"
        />
        <text x="42" y="47" textAnchor="middle" className="fill-slate-700 text-sm font-semibold">
          {value}/{total}
        </text>
      </svg>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  )
}

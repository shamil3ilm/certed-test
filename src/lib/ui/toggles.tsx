import { cx } from './core'

type ToggleTone = 'primary' | 'secondary' | 'soft' | 'success' | 'warning' | 'danger' | 'slate'

function activeToggleToneClass(tone: ToggleTone): string {
  switch (tone) {
    case 'secondary':
      return 'border-secondary/20 bg-secondary/10 text-secondary-ink'
    case 'soft':
      return 'border-primary/20 bg-primary/5 text-primary'
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'danger':
      return 'border-red-200 bg-red-50 text-red-700'
    case 'slate':
      return 'border-slate-200 bg-slate-100 text-slate-700'
    case 'primary':
    default:
      return 'border-primary/20 bg-primary/10 text-primary'
  }
}

export function pillButtonClass(active: boolean, tone: ToggleTone = 'primary', className = ''): string {
  return cx(
    'min-h-10 rounded-full border px-4 py-2 text-sm font-medium transition',
    active ? activeToggleToneClass(tone) : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
    className,
  )
}

export function segmentedButtonClass(active: boolean, tone: ToggleTone = 'primary', className = ''): string {
  return cx(
    'px-3 py-1.5 text-xs font-medium transition disabled:opacity-50',
    active ? activeToggleToneClass(tone) : 'bg-white text-slate-600 hover:bg-slate-50',
    className,
  )
}

export const SEGMENTED_GROUP = 'inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white'

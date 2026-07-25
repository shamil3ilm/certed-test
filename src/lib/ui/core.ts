/* ----------------------------------------------------------------------------
 * Design tokens and the class-name helper - the primitives every other UI module
 * builds on. Brand colours live as CSS variables in globals.css (--primary etc).
 * ------------------------------------------------------------------------- */

/** Join class names, dropping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** The standard white content-box surface. */
export const CARD = 'rounded-2xl border border-slate-200 bg-white shadow-sm'

/** A muted "kept on record" row - the archived-items lists (announcements,
 *  materials, meet links, past reminders) all render their entries this way. */
export const ARCHIVED_ROW =
  'flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2'

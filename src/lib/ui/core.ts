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

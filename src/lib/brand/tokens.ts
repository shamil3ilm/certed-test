export const BRAND_COLORS = {
  primary: '#124d7e',
  primaryStrong: '#0f365c',
  secondary: '#50b5e1',
} as const

/**
 * Calendar source palette - distinct category hues for the grid, kept beside the
 * brand palette so every named colour value in the app lives in one module.
 * `slot` reuses BRAND_COLORS.primary (see calendar-config). `fallback` is the
 * colour for an item with no known source; `inactive` is a toggled-off legend dot.
 */
export const CALENDAR_COLORS = {
  event: '#16a34a',
  assignment: '#dc2626',
  meet: '#7c3aed',
  fallback: '#94a3b8',
  inactive: '#cbd5e1',
} as const

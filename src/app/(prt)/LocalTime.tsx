'use client'

import { formatDate, formatDateTime, DISPLAY_TZ } from '@/lib/time/format'
import { useHydratedFlag } from '@/lib/ui/client-env'

/**
 * Renders a stored UTC instant in the VIEWER'S OWN device timezone - the one
 * consistent time source across the whole app (matching the calendar).
 *
 * Server rendering can't know the device zone, so we can't format device-local
 * on the server without a hydration mismatch. Instead: SSR and the first client
 * render both use the institute zone (deterministic -> hydration matches), then an
 * effect flips to the device zone after mount. `suppressHydrationWarning` covers
 * the intended swap.
 */
export function LocalTime({ iso, mode = 'datetime' }: { iso: string; mode?: 'date' | 'datetime' }) {
  const deviceLocal = useHydratedFlag()
  const tz = deviceLocal ? undefined : DISPLAY_TZ
  const text = mode === 'date' ? formatDate(iso, tz) : formatDateTime(iso, tz)
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  )
}

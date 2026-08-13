'use client'

import { formatDate, formatDateTime, formatTime } from '@/lib/time/format'
import { useViewerTimeZone } from './ViewerTimeZone'

/**
 * Renders a stored UTC instant in the VIEWER'S OWN timezone - the one consistent
 * time source across the whole app (matching the calendar).
 *
 * The zone comes from <ViewerTimeZoneProvider> (server-seeded from the `tz` cookie /
 * geo header, then confirmed to the device on mount). Because the server already
 * knows the viewer's zone on a repeat visit, the first paint is already local - no
 * institute-zone flash. `suppressHydrationWarning` covers the first-ever visit,
 * where the server falls back to the institute zone until the cookie is written.
 */
export function LocalTime({ iso, mode = 'datetime' }: { iso: string; mode?: 'date' | 'datetime' | 'time' }) {
  const tz = useViewerTimeZone()
  const text = mode === 'date' ? formatDate(iso, tz) : mode === 'time' ? formatTime(iso, tz) : formatDateTime(iso, tz)
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  )
}

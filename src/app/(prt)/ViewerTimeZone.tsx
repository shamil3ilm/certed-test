'use client'

import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { DISPLAY_TZ } from '@/lib/time/format'
import { useBrowserTimeZone } from '@/lib/ui/client-env'

/**
 * The viewer's timezone, made available to <LocalTime> so every instant renders
 * in the reader's OWN zone. The server seeds `initialTz` (from the `tz` cookie, or
 * a geo-IP header, else the institute zone). `useBrowserTimeZone` returns null on
 * the server / first hydration render (so it matches SSR) and the real device zone
 * thereafter - so `tz` is DERIVED, no state to sync. The effect only persists the
 * device zone in the `tz` cookie, so the NEXT server render is already local and
 * there's no institute-zone flash.
 */
const ViewerTzContext = createContext<string>(DISPLAY_TZ)

export function useViewerTimeZone(): string {
  return useContext(ViewerTzContext)
}

export function ViewerTimeZoneProvider({ initialTz, children }: { initialTz: string; children: ReactNode }) {
  const browserTz = useBrowserTimeZone(initialTz)
  const tz = browserTz ?? initialTz

  useEffect(() => {
    if (!browserTz || browserTz === initialTz) return
    // One year; lax so it rides normal navigations. Client-only write - a layout
    // can't set cookies server-side, and we don't need it to.
    document.cookie = `tz=${encodeURIComponent(browserTz)}; path=/; max-age=31536000; samesite=lax`
  }, [browserTz, initialTz])

  return <ViewerTzContext.Provider value={tz}>{children}</ViewerTzContext.Provider>
}

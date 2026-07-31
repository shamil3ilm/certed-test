'use client'

import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

// Some engines still report deprecated IANA aliases (notably Asia/Calcutta for
// Asia/Kolkata) from resolvedOptions(). They name the same zone, but showing an
// older alias next to the academy's configured Asia/Kolkata reads as an
// inconsistency, so canonicalize the common ones so the label matches.
const TZ_ALIASES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Dacca': 'Asia/Dhaka',
}

function canonicalTimeZone(tz: string): string {
  return TZ_ALIASES[tz] ?? tz
}

export function useHydratedFlag() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}

export function useBrowserTimeZone(fallback = 'UTC') {
  return useSyncExternalStore(
    noopSubscribe,
    () => canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || fallback),
    () => null,
  )
}

export function useMediaQuery(query: string, serverSnapshot = false) {
  return useSyncExternalStore(
    (notify) => {
      const mediaQuery = window.matchMedia(query)
      mediaQuery.addEventListener('change', notify)
      return () => mediaQuery.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => serverSnapshot,
  )
}

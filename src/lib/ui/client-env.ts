'use client'

import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

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
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || fallback,
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

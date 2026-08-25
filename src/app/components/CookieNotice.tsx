'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'

const DISMISS_KEY = 'certed-cookie-notice-dismissed'

/**
 * Strictly-necessary cookie notice. We set only essential sign-in cookies and use no
 * tracking/advertising cookies, so this is an informational notice (a "got it" dismiss),
 * NOT a consent banner with accept/reject. Dismissal is remembered per browser.
 *
 * The dismissed flag lives in localStorage, which doesn't exist during SSR - reading it
 * in render would hydration-mismatch, and reading it in an effect trips
 * react-hooks/set-state-in-effect. useSyncExternalStore is React's answer for exactly
 * this: the SERVER snapshot reports "dismissed" so nothing renders during SSR / before
 * hydration (no flash for returning visitors), and the CLIENT snapshot reads storage.
 */
const dismissListeners = new Set<() => void>()

function subscribe(onStoreChange: () => void): () => void {
  dismissListeners.add(onStoreChange)
  // Another tab dismissing fires a `storage` event; reflect it here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === DISMISS_KEY) onStoreChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    dismissListeners.delete(onStoreChange)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // Private mode / storage blocked - show it; dismiss just won't persist.
    return false
  }
}

// Server / pre-hydration: assume dismissed so the bar renders nothing until the client
// has read storage. Constant, so no hydration mismatch.
const getServerSnapshot = (): boolean => true

function dismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* non-persistent dismiss is fine */
  }
  // `storage` events don't fire in the same tab, so notify local subscribers directly.
  dismissListeners.forEach((listener) => listener())
}

export default function CookieNotice() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (dismissed) return null

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-gray-700">
          We use essential cookies to keep you signed in. We use no tracking or advertising cookies. See our{' '}
          <Link href="/privacy" className="text-primary underline hover:no-underline">
            Privacy Policy
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

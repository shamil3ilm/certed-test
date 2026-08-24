'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const DISMISS_KEY = 'certed-cookie-notice-dismissed'

/**
 * Strictly-necessary cookie notice. We set only essential sign-in cookies and use no
 * tracking/advertising cookies, so this is an informational notice (a "got it" dismiss),
 * NOT a consent banner with accept/reject. Dismissal is remembered per browser.
 */
export default function CookieNotice() {
  // Start hidden so SSR and the pre-hydration client agree; reveal only after we've
  // checked storage, so a returning visitor never sees a flash of the bar.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) !== '1') setVisible(true)
    } catch {
      // Private mode / storage blocked — show it; dismiss just won't persist.
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* non-persistent dismiss is fine */
    }
    setVisible(false)
  }

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

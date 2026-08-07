'use client'

import { useEffect, useState } from 'react'
import { GoogleSignIn } from './GoogleSignIn'

const GOOGLE_HASH = '#google'

/**
 * Google sign-in is hidden by default and revealed only when the login URL
 * carries the #google fragment (e.g. /login#google) - a soft gate while the SSO
 * flow is being rolled out. The fragment is client-only (never sent to the
 * server), so the reveal has to happen client-side.
 *
 * Both server and first client render return null, so hydration matches; the
 * effect then reveals the button when the hash is present, and keeps it in sync
 * if the user edits the fragment (hashchange).
 */
export function GoogleSignInGate() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const sync = () => setShow(window.location.hash.toLowerCase() === GOOGLE_HASH)
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  if (!show) return null

  return (
    <>
      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
      </div>
      <GoogleSignIn />
    </>
  )
}

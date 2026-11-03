'use client'

import { GoogleSignIn } from './GoogleSignIn'

/**
 * Sign in with Google option.
 * Rendered by default above email/password without requiring #google hash.
 */
export function GoogleSignInGate() {
  return (
    <div className="mb-4">
      <GoogleSignIn />
      <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-slate-200" /> or continue with email{' '}
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  )
}

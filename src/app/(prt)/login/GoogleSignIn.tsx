'use client'

import { useState } from 'react'
import { getBrowserAuthAvailability, signInWithGoogleClient } from '../auth-client'
import { AlertBanner, GoogleIcon } from '@/lib/ui'

export function GoogleSignIn() {
  const authAvailability = getBrowserAuthAvailability()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    if (!authAvailability.ok) {
      setError(authAvailability.message)
      return
    }

    setBusy(true)
    setError(null)

    try {
      await signInWithGoogleClient()
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Could not start Google sign-in.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={signIn}
        disabled={busy || !authAvailability.ok}
        className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-3 font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-slate-50 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleIcon />
        {busy ? 'Starting Google sign-in...' : 'Sign in with Google'}
      </button>
      {!authAvailability.ok && <AlertBanner tone="warning">{authAvailability.message}</AlertBanner>}
      {error && <AlertBanner tone="warning">{error}</AlertBanner>}
    </div>
  )
}

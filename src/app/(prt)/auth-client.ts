'use client'

import { createClient, getPublicSupabaseEnvError } from '@/lib/supabase/client'

const INVALID_CREDENTIALS_MESSAGE = 'Wrong email or password.'
const OAUTH_SIGN_IN_MESSAGE = 'Could not start Google sign-in.'
// Shown to end users: deliberately generic. The specific misconfiguration (which
// NEXT_PUBLIC_* value is missing, and that it must be a non-sensitive, build-time
// variable) is written to the logs by logAuthConfigIssue() rather than leaked to
// the UI - internal configuration detail must never surface to users in production.
const PUBLIC_AUTH_ENV_MESSAGE = 'Sign-in is temporarily unavailable. Please try again in a few minutes.'

/**
 * Records the real reason for operators without exposing it to users. It runs at
 * the point sign-in is attempted / the form checks availability, so a missing
 * public env var is diagnosable from the browser console and client error
 * monitoring instead of guesswork - while the user only ever sees the generic
 * message above. (The missing value is build-time inlined into the client bundle,
 * so this branch is reached on the client; the server keeps the runtime value.)
 */
function logAuthConfigIssue(): void {
  const detail = getPublicSupabaseEnvError()
  if (detail) {
    console.error(
      `[auth] Browser Supabase client is not configured: ${detail} ` +
        'These NEXT_PUBLIC_* values must be present (non-sensitive) at BUILD time and the app redeployed.',
    )
  }
}

function requireBrowserAuthConfig(): void {
  if (getPublicSupabaseEnvError()) {
    logAuthConfigIssue()
    throw new Error(PUBLIC_AUTH_ENV_MESSAGE)
  }
}

export function getBrowserAuthAvailability(): { ok: true } | { ok: false; message: string } {
  if (getPublicSupabaseEnvError()) {
    logAuthConfigIssue()
    return { ok: false, message: PUBLIC_AUTH_ENV_MESSAGE }
  }
  return { ok: true }
}

export async function signInWithPasswordClient(email: string, password: string): Promise<void> {
  requireBrowserAuthConfig()

  const { error } = await createClient().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })

  if (error) {
    throw new Error(INVALID_CREDENTIALS_MESSAGE)
  }
}

export async function signInWithGoogleClient(): Promise<void> {
  requireBrowserAuthConfig()

  const { error } = await createClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })

  if (error) {
    throw new Error(OAUTH_SIGN_IN_MESSAGE)
  }
}

'use client'

import { createClient, getPublicSupabaseEnvError } from '@/lib/supabase/client'

const INVALID_CREDENTIALS_MESSAGE = 'Wrong email or password.'
const OAUTH_SIGN_IN_MESSAGE = 'Could not start Google sign-in.'
const SIGN_IN_FAILED_MESSAGE = 'Something went wrong signing you in. Please try again.'

/**
 * Runs a Supabase auth call and converts any THROWN error into a generic,
 * user-safe message (the detail is logged, never shown). Supabase surfaces
 * expected auth failures as a returned `{ error }` (the caller maps those to a
 * friendly message); this guards the UNEXPECTED throws - a client/SDK init or
 * network failure - that would otherwise reach the form's catch and render a raw
 * internal message to the user.
 */
async function runAuth<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    console.error('[auth] unexpected sign-in error:', error instanceof Error ? error.message : error)
    throw new Error(SIGN_IN_FAILED_MESSAGE)
  }
}
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

  const { error } = await runAuth(() =>
    createClient().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    }),
  )

  if (error) {
    // The message shown to the USER stays deliberately generic: naming the cause ("no
    // such account", "this account is suspended") would let anyone probe which emails
    // exist, the same reason /register answers every rejection identically.
    //
    // But discarding the cause entirely is what made a suspended or never-registered
    // account indistinguishable from a typo - both read as "you forgot your password",
    // with nothing recorded anywhere to say otherwise. Record the real reason (status +
    // code, e.g. 400 invalid_credentials vs 403 user_banned) so a lockout is diagnosable
    // without weakening what the login form discloses.
    const { status, message } = error
    const code = (error as { code?: string }).code
    console.error('[auth] sign-in refused:', [status, code, message].filter(Boolean).join(' - '))
    throw new Error(INVALID_CREDENTIALS_MESSAGE)
  }
}

export async function signInWithGoogleClient(): Promise<void> {
  requireBrowserAuthConfig()

  const { error } = await runAuth(() =>
    createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    }),
  )

  if (error) {
    throw new Error(OAUTH_SIGN_IN_MESSAGE)
  }
}

const RESET_REQUEST_MESSAGE = 'Could not send the reset email. Please try again in a few minutes.'
const PASSWORD_UPDATE_MESSAGE = 'Could not update your password. Your reset link may have expired - request a new one.'

/**
 * Sends a password-reset email. Deliberately succeeds whether or not the address
 * has an account (Supabase does not reveal existence, and the UI shows the same
 * "check your inbox" message either way), so this never lets someone enumerate
 * registered emails. The link lands on /auth/callback, which exchanges it for a
 * short recovery session and forwards to /login/reset to set a new password.
 */
export async function requestPasswordResetClient(email: string): Promise<void> {
  requireBrowserAuthConfig()

  const { error } = await runAuth(() =>
    createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/login/reset')}`,
    }),
  )

  if (error) {
    throw new Error(RESET_REQUEST_MESSAGE)
  }
}

/** Sets a new password for the user in the current (recovery) session. */
export async function updatePasswordClient(password: string): Promise<void> {
  requireBrowserAuthConfig()

  const client = createClient()
  const { error } = await runAuth(() => client.auth.updateUser({ password }))

  if (error) {
    throw new Error(PASSWORD_UPDATE_MESSAGE)
  }

  // A reset is often done BECAUSE another session was compromised, so revoke every
  // OTHER session once the new password is set - keeping this (recovery) one. Best-effort:
  // the password is already updated, so this cleanup must never fail the reset.
  try {
    await client.auth.signOut({ scope: 'others' })
  } catch {
    // The password change already succeeded; a failure to revoke siblings is non-fatal.
  }
}

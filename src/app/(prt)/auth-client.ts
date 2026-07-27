'use client'

import { createClient, getPublicSupabaseEnvError } from '@/lib/supabase/client'

const INVALID_CREDENTIALS_MESSAGE = 'Wrong email or password.'
const OAUTH_SIGN_IN_MESSAGE = 'Could not start Google sign-in.'
const PUBLIC_AUTH_ENV_MESSAGE =
  'Sign-in is temporarily unavailable because this deployment is missing public Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the deployment environment and redeploy.'

function requireBrowserAuthConfig(): void {
  if (getPublicSupabaseEnvError()) {
    throw new Error(PUBLIC_AUTH_ENV_MESSAGE)
  }
}

export function getBrowserAuthAvailability(): { ok: true } | { ok: false; message: string } {
  return getPublicSupabaseEnvError() ? { ok: false, message: PUBLIC_AUTH_ENV_MESSAGE } : { ok: true }
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

'use client'

import { createClient } from '@/lib/supabase/client'

const INVALID_CREDENTIALS_MESSAGE = 'Wrong email or password.'
const OAUTH_SIGN_IN_MESSAGE = 'Could not start Google sign-in.'

export async function signInWithPasswordClient(email: string, password: string): Promise<void> {
  const { error } = await createClient().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })

  if (error) {
    throw new Error(INVALID_CREDENTIALS_MESSAGE)
  }
}

export async function signInWithGoogleClient(): Promise<void> {
  const { error } = await createClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })

  if (error) {
    throw new Error(OAUTH_SIGN_IN_MESSAGE)
  }
}

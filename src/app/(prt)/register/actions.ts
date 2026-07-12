'use server'
import { isMock } from '@/lib/mock/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { registerSchema } from '@/lib/validation/user'
import { getRegistrationTarget, bindPasswordAccount } from '@/lib/repos/users'
import { setupCodeValid } from '@/lib/auth/setupCode'

export type RegisterState = { ok?: boolean; error?: string }

/**
 * Self-registration: an allowlisted, unclaimed profile whose setup code matches
 * gets a Supabase auth account created (email pre-confirmed) and bound. Errors are
 * deliberately uniform so we never reveal whether the email or the code was wrong.
 */
export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  if (isMock()) return { error: 'Password registration is only available in production mode.' }

  const parsed = registerSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    code: String(formData.get('code') ?? ''),
    password: String(formData.get('password') ?? ''),
  })
  if (!parsed.success) return { error: 'Check your email, code, and password (min 8 characters).' }
  const { email, code, password } = parsed.data

  const invalid = { error: 'That email or code isn’t valid, or the account is already set up.' }
  const target = await getRegistrationTarget(email)
  if (!target || target.status !== 'active' || target.auth_user_id) return invalid
  if (!setupCodeValid(code, target.setup_code_hash, target.setup_code_expires_at)) return invalid

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
  })
  if (error || !data?.user) return { error: 'Could not create your account. Please try again.' }

  const bound = await bindPasswordAccount(target.id, data.user.id)
  if (!bound) {
    // Lost a race to another claim — remove the orphaned auth user.
    await admin.auth.admin.deleteUser(data.user.id)
    return { error: 'This account was just set up by someone else.' }
  }
  return { ok: true }
}

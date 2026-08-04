'use server'
import { headers } from 'next/headers'
import { actionDone, actionFail, type ActionStatusResult } from '@/lib/api/action-error'
import { ERROR_CODES } from '@/lib/api/error-codes'
import { isMock } from '@/lib/mock/env'
import { completePasswordRegistration } from '@/lib/services/users'
import { clientIp } from '@/lib/security/rate-limit'
import { rateLimitShared } from '@/lib/security/rate-limit-shared'
import { registerSchema } from '@/lib/validation/user'

// The shared envelope already carries the machine-readable `code`, so this is
// just the standard action result - no separate errorCode field to keep in step.
export type RegisterState = ActionStatusResult

/**
 * Self-registration: an allowlisted, unclaimed profile whose setup code matches
 * gets a Supabase auth account created and bound. The action owns input parsing
 * and throttling; the user domain owns the registration workflow itself.
 */
export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  if (isMock()) {
    return actionFail('Password registration is only available in production mode.', ERROR_CODES.invalidRequest)
  }

  const rl = await rateLimitShared(`register:${clientIp(await headers())}`, { limit: 8, windowSeconds: 10 * 60 })
  if (!rl.ok) {
    return actionFail('Too many attempts. Please wait a few minutes and try again.', ERROR_CODES.rateLimited)
  }

  const parsed = registerSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    code: String(formData.get('code') ?? ''),
    password: String(formData.get('password') ?? ''),
  })
  if (!parsed.success) {
    return actionFail('Check your email, code, and password (min 8 characters).', ERROR_CODES.invalidInput)
  }

  const result = await completePasswordRegistration(parsed.data)
  if ('ok' in result) return actionDone()
  return actionFail(result.error, result.code)
}

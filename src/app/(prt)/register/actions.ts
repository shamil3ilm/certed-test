'use server'
import { headers } from 'next/headers'
import { actionDone, actionFail, type ActionStatusResult } from '@/lib/api/action-error'
import { ERROR_CODES, type ErrorCode } from '@/lib/api/error-codes'
import { isMock } from '@/lib/mock/env'
import { completePasswordRegistration } from '@/lib/services/users'
import { rateLimit, clientIp } from '@/lib/security/rate-limit'
import { registerSchema } from '@/lib/validation/user'

export type RegisterState = ActionStatusResult & { errorCode?: ErrorCode }

/**
 * Self-registration: an allowlisted, unclaimed profile whose setup code matches
 * gets a Supabase auth account created and bound. The action owns input parsing
 * and throttling; the user domain owns the registration workflow itself.
 */
export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  if (isMock()) {
    return {
      ...actionFail('Password registration is only available in production mode.', ERROR_CODES.invalidRequest),
      errorCode: ERROR_CODES.invalidRequest,
    }
  }

  const rl = rateLimit(`register:${clientIp(headers())}`, { limit: 8, windowMs: 10 * 60 * 1000 })
  if (!rl.ok) {
    return {
      ...actionFail('Too many attempts. Please wait a few minutes and try again.', ERROR_CODES.rateLimited),
      errorCode: ERROR_CODES.rateLimited,
    }
  }

  const parsed = registerSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    code: String(formData.get('code') ?? ''),
    password: String(formData.get('password') ?? ''),
  })
  if (!parsed.success) {
    return {
      ...actionFail('Check your email, code, and password (min 8 characters).', ERROR_CODES.invalidInput),
      errorCode: ERROR_CODES.invalidInput,
    }
  }

  const result = await completePasswordRegistration(parsed.data)
  if ('ok' in result) return actionDone()
  return { ...actionFail(result.error, result.code), errorCode: result.code }
}

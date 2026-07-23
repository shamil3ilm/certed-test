import { writeAudit } from '@/lib/data/audit'
import { bindMockAuthUserId, selectMockCredentialProfile } from '@/lib/data/profiles'
import { ERROR_CODES, type ErrorCode } from '@/lib/api/error-codes'

export type MockLoginResult = { ok: true; uid: string } | { ok: false; code: ErrorCode }

/** Dev/mock credential login. Keeps profile lookup, password fallback, first
 *  bind, and audit ownership out of the route handler. */
export async function loginMockPasswordUser(
  email: string,
  password: string,
  devPassword = process.env.MOCK_PASSWORD || 'cert-ed',
): Promise<MockLoginResult> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !password) {
    void writeAudit({ actor_id: null, action: 'auth.login_failure', entity_type: 'profile', entity_id: null })
    return { ok: false, code: ERROR_CODES.invalidInput }
  }

  const profile = await selectMockCredentialProfile(normalizedEmail)
  if (!profile) {
    void writeAudit({ actor_id: null, action: 'auth.login_failure', entity_type: 'profile', entity_id: null })
    return { ok: false, code: ERROR_CODES.unauthorized }
  }

  const ownPassword = profile.password ?? null
  const ok = ownPassword ? password === ownPassword : password === devPassword
  if (!ok) {
    void writeAudit({
      actor_id: profile.id,
      action: 'auth.login_failure',
      entity_type: 'profile',
      entity_id: profile.id,
    })
    return { ok: false, code: ERROR_CODES.unauthorized }
  }

  let uid = profile.auth_user_id
  if (!uid) {
    uid = `mock:${profile.id}`
    await bindMockAuthUserId(profile.id, uid)
  }

  await writeAudit({
    actor_id: profile.id,
    action: 'auth.login_success',
    entity_type: 'profile',
    entity_id: profile.id,
  })
  return { ok: true, uid }
}

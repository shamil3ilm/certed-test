import { writeAudit } from '@/lib/repos/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { ERROR_CODES, type ErrorCode } from '@/lib/api/error-codes'

export type MockLoginResult =
  | { ok: true; uid: string }
  | { ok: false; code: ErrorCode }

type MockProfile = {
  id: string
  auth_user_id: string | null
  password?: string | null
}

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

  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('*').eq('email', normalizedEmail).maybeSingle()
  const profile = (data as MockProfile | null) ?? null
  if (!profile) {
    void writeAudit({ actor_id: null, action: 'auth.login_failure', entity_type: 'profile', entity_id: null })
    return { ok: false, code: ERROR_CODES.unauthorized }
  }

  const ownPassword = profile.password ?? null
  const ok = ownPassword ? password === ownPassword : password === devPassword
  if (!ok) {
    void writeAudit({ actor_id: profile.id, action: 'auth.login_failure', entity_type: 'profile', entity_id: profile.id })
    return { ok: false, code: ERROR_CODES.unauthorized }
  }

  let uid = profile.auth_user_id
  if (!uid) {
    uid = `mock:${profile.id}`
    await admin.from('profiles').update({ auth_user_id: uid }).eq('id', profile.id)
  }

  await writeAudit({ actor_id: profile.id, action: 'auth.login_success', entity_type: 'profile', entity_id: profile.id })
  return { ok: true, uid }
}

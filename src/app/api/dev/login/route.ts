import { NextResponse } from 'next/server'
import { isMock } from '@/lib/mock/env'
import { MOCK_COOKIE } from '@/lib/mock/session'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Dev-only credential sign-in. POST email + password (form-encoded). All mock
 * users share one password (MOCK_PASSWORD, default "cert-ed"). On success the
 * caller's mock identity is bound (allowlist-only users bind on first login) and
 * the session cookie is set. Passwordless login is intentionally NOT supported.
 */
const DEV_PASSWORD = process.env.MOCK_PASSWORD || 'cert-ed'

export async function POST(request: Request) {
  if (!isMock()) return new NextResponse('Not found', { status: 404 })

  // Single session: you must sign out before signing in as someone else.
  const { getMockUidFromStore } = await import('@/lib/mock/session')
  if (await getMockUidFromStore()) {
    return NextResponse.redirect(new URL('/dashboard', request.url), 303)
  }

  const form = await request.formData()
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const password = String(form.get('password') ?? '')
  const fail = () => NextResponse.redirect(new URL('/login?error=1', request.url), 303)
  if (!email || !password) return fail()

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('*').eq('email', email).maybeSingle()
  if (!profile) return fail()

  // A password the user set in Settings wins; otherwise the shared demo password.
  const ownPassword = (profile.password as string | null) ?? null
  const ok = ownPassword ? password === ownPassword : password === DEV_PASSWORD
  if (!ok) return fail()

  let uid = (profile.auth_user_id as string | null) ?? null
  if (!uid) {
    uid = `mock:${profile.id as string}`
    await admin.from('profiles').update({ auth_user_id: uid }).eq('id', profile.id)
  }

  const res = NextResponse.redirect(new URL('/dashboard', request.url), 303)
  res.cookies.set(MOCK_COOKIE, uid, { httpOnly: true, sameSite: 'lax', path: '/' })
  return res
}

// Passwordless login removed — always require the credential form.
export function GET(request: Request) {
  return NextResponse.redirect(new URL('/login', request.url))
}

import { NextResponse } from 'next/server'
import { isMock } from '@/lib/mock/env'
import { MOCK_COOKIE, getMockUidFromStore } from '@/lib/mock/session'
import { loginMockPasswordUser } from '@/lib/services/mock-auth'

export async function POST(request: Request) {
  if (!isMock()) return new NextResponse('Not found', { status: 404 })

  if (await getMockUidFromStore()) {
    return NextResponse.redirect(new URL('/dashboard', request.url), 303)
  }

  const form = await request.formData()
  const result = await loginMockPasswordUser(
    String(form.get('email') ?? ''),
    String(form.get('password') ?? ''),
  )
  if (!result.ok) {
    return NextResponse.redirect(new URL('/login?error=1', request.url), 303)
  }

  const res = NextResponse.redirect(new URL('/dashboard', request.url), 303)
  res.cookies.set(MOCK_COOKIE, result.uid, { httpOnly: true, sameSite: 'lax', path: '/' })
  return res
}

export function GET(request: Request) {
  return NextResponse.redirect(new URL('/login', request.url))
}

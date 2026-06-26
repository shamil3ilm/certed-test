import { NextResponse } from 'next/server'
import { isMock } from '@/lib/mock/env'
import { MOCK_COOKIE } from '@/lib/mock/session'

/** Dev-only sign-out: clears the mock identity cookie. */
export async function GET(request: Request) {
  if (!isMock()) return new NextResponse('Not found', { status: 404 })
  const res = NextResponse.redirect(new URL('/login', request.url))
  res.cookies.delete(MOCK_COOKIE)
  return res
}

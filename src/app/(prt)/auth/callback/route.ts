import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bindProfileOnFirstLogin } from '@/lib/auth/binding'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    const { data } = await supabase.auth.exchangeCodeForSession(code)
    // Bind the auth user to their pre-created allowlist profile on first login.
    if (data.user?.email) {
      await bindProfileOnFirstLogin(data.user.id, data.user.email)
    }
  }
  return NextResponse.redirect(`${origin}/dashboard`)
}

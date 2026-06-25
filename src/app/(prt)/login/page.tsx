'use client'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const signIn = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }
  return (
    <main className="grid min-h-screen place-items-center">
      <button
        onClick={signIn}
        className="rounded-lg border bg-white px-6 py-3 font-medium shadow-sm hover:shadow"
      >
        Sign in with Google
      </button>
    </main>
  )
}

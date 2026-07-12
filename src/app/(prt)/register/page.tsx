import Image from 'next/image'
import { redirect } from 'next/navigation'
import { isMock } from '@/lib/mock/env'
import { getProfile } from '@/lib/auth/profile'
import { RegisterForm } from './RegisterForm'

export default async function RegisterPage() {
  // Password registration is a real-Supabase feature; mock mode uses the dev login.
  if (isMock()) redirect('/login')
  const existing = await getProfile()
  if (existing) redirect('/dashboard')

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-50 p-6">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-secondary/30 to-primary/20 blur-3xl" />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/cert-ed-academia-online-tuition-logo.webp"
            alt="Cert-Ed Academia"
            width={260}
            height={64}
            className="h-12 w-auto object-contain"
            priority
          />
          <h1 className="mt-6 text-lg font-semibold text-slate-900">Set up your account</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your email, the setup code from your admin, and a new password.
          </p>
        </div>
        <div className="mt-6">
          <RegisterForm />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Already set up? <a href="/login" className="font-medium text-primary hover:underline">Sign in</a>
        </p>
      </div>
    </main>
  )
}

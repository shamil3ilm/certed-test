import { redirect } from 'next/navigation'
import { isMock } from '@/lib/mock/env'
import { getActorContext } from '@/lib/session/actor-context'
import { loadRegisterPageData } from '@/lib/services/page-data/auth-entry-page'
import { AuthShell } from '../auth/AuthShell'
import { RegisterForm } from './RegisterForm'

export default async function RegisterPage() {
  const data = loadRegisterPageData(await getActorContext(), isMock())
  if (data.redirectTo) redirect(data.redirectTo)

  return (
    <AuthShell
      title="Set up your account"
      subtitle="Enter your email, the setup code from your admin, and a new password."
    >
      <RegisterForm />
      <p className="mt-6 text-center text-xs text-slate-500">
        Already set up?{' '}
        <a href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </a>
      </p>
    </AuthShell>
  )
}

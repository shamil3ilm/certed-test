import { AuthShell } from '../../auth/AuthShell'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we'll send you a reset link.">
      <ForgotPasswordForm />
    </AuthShell>
  )
}

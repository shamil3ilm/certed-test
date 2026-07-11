import { redirect } from 'next/navigation'

// History is hidden for now (audit records keep accruing via writeAudit).
export default function HistoryPage() {
  redirect('/dashboard')
}

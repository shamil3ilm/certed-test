import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { CalendarView } from './CalendarView'
import { TimetableManager } from './TimetableManager'

export default async function CalendarPage() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')

  const canManage = profile.role === 'teacher' || profile.role === 'admin'

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Calendar</h1>
      <CalendarView canManage={canManage} />
      {canManage && <TimetableManager />}
    </main>
  )
}

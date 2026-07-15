import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { listClasses } from '@/lib/services/classes'
import { listClassTeachers } from '@/lib/services/classTeachers'
import { listProfiles } from '@/lib/services/users'
import { CalendarView } from './CalendarView'
import { TimetableManager } from './TimetableManager'
import { PageHeader } from '../ui'

export default async function CalendarPage() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')

  const canManage = profile.role === 'teacher' || profile.role === 'admin'
  const isAdmin = profile.role === 'admin'

  // ClassRow + teacher option lists for the management forms, scoped by role:
  // an admin manages all classes/teachers; a teacher only the classes they teach.
  let classes: { id: string; name: string }[] = []
  let teachers: { id: string; name: string }[] = []
  if (canManage) {
    if (isAdmin) {
      // Independent reads — classes and the teacher roster in parallel.
      const [allClasses, profiles] = await Promise.all([listClasses(), listProfiles()])
      classes = allClasses.filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name }))
      teachers = profiles
        .filter((p) => p.role === 'teacher')
        .map((p) => ({ id: p.id, name: p.full_name ?? p.email }))
    } else {
      const [allClasses, myTeaching] = await Promise.all([listClasses(), listClassTeachers()])
      // Explicit scope filter (don't rely on RLS alone) — mirrors the dashboard.
      const mine = new Set(myTeaching.filter((ct) => ct.teacher_id === profile.id).map((ct) => ct.class_id))
      classes = allClasses
        .filter((c) => c.status === 'active' && mine.has(c.id))
        .map((c) => ({ id: c.id, name: c.name }))
      teachers = [{ id: profile.id, name: profile.full_name ?? profile.email }]
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader title="Calendar" />
      <CalendarView canManage={canManage} classes={classes} isAdmin={isAdmin} />
      {canManage && <TimetableManager classes={classes} teachers={teachers} isAdmin={isAdmin} />}
    </main>
  )
}

import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { listCourses } from '@/lib/repos/courses'
import { listCourseTeachers } from '@/lib/repos/courseTeachers'
import { listProfiles } from '@/lib/repos/users'
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

  // Course + teacher option lists for the management forms, scoped by role:
  // an admin manages all courses/teachers; a teacher only the courses they teach.
  let courses: { id: string; name: string }[] = []
  let teachers: { id: string; name: string }[] = []
  if (canManage) {
    const all = await listCourses()
    if (isAdmin) {
      courses = all.map((c) => ({ id: c.id, name: c.name }))
      teachers = (await listProfiles())
        .filter((p) => p.role === 'teacher')
        .map((p) => ({ id: p.id, name: p.full_name ?? p.email }))
    } else {
      const mine = new Set((await listCourseTeachers()).map((ct) => ct.course_id))
      courses = all.filter((c) => mine.has(c.id)).map((c) => ({ id: c.id, name: c.name }))
      teachers = [{ id: profile.id, name: profile.full_name ?? profile.email }]
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader title="Calendar" />
      <CalendarView canManage={canManage} courses={courses} isAdmin={isAdmin} />
      {canManage && <TimetableManager courses={courses} teachers={teachers} isAdmin={isAdmin} />}
    </main>
  )
}

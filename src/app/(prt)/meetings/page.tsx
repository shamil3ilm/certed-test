import { requireRole } from '@/lib/auth/requireRole'
import { listMeetLinks } from '@/lib/repos/meetLinks'
import { listCommentsForMeet } from '@/lib/repos/meetComments'
import { listCourses } from '@/lib/repos/courses'
import { listCourseTeachers } from '@/lib/repos/courseTeachers'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageHeader } from '../ui'
import { MeetForm } from './MeetForm'
import { MeetList } from './MeetList'

export default async function MeetingsPage() {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const allCourses = await listCourses()

  // Filter courses available for sharing links in the form (if admin/teacher)
  let formCourses: { id: string; name: string }[] = []
  if (me.role === 'admin') {
    formCourses = allCourses.filter((c) => c.status === 'active')
  } else if (me.role === 'teacher') {
    const admin = createAdminClient()
    const { data } = await admin
      .from('course_teachers')
      .select('course_id')
      .eq('teacher_id', me.id)
    const assignedIds = new Set((data ?? []).map((r: any) => r.course_id))
    formCourses = allCourses.filter((c) => c.status === 'active' && assignedIds.has(c.id))
  }

  // Fetch meet links scoped by user's RLS policies
  const meetLinks = await listMeetLinks()

  // Fetch comments for all displayed meet links in parallel
  const commentsMap: Record<string, any[]> = {}
  await Promise.all(
    meetLinks.map(async (m) => {
      commentsMap[m.id] = await listCommentsForMeet(m.id)
    }),
  )

  const canManage = me.role === 'admin' || me.role === 'teacher'

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Meetings" description="Online classroom links and video conferencing sessions." />

      {canManage && (
        <div className="mt-6">
          <MeetForm courses={formCourses} canGlobal={me.role === 'admin'} />
        </div>
      )}

      <div className="mt-8">
        <MeetList meetLinks={meetLinks} initialComments={commentsMap} me={me} courses={allCourses} />
      </div>
    </main>
  )
}

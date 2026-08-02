import type { Profile } from '@/lib/auth/profile'
import { canAccessClass } from '@/lib/permission'
import { canMentor, getMenteeOverview } from '@/lib/services/mentees'

type MenteeDetailSearchParams = {
  period?: string
  classId?: string
  sort?: string
}

type MenteeDetailPageData = {
  overview: NonNullable<Awaited<ReturnType<typeof getMenteeOverview>>>
  name: string
  /** Of the mentee's classes, the ids this viewer may actually open (admin, or a
   *  tutor/enrollee of the class) - the rest are shown for context only. */
  openableClassIds: string[]
}

export async function loadMenteeDetailPageData(
  actor: Profile,
  studentId: string,
  searchParams?: MenteeDetailSearchParams,
): Promise<MenteeDetailPageData | null> {
  if (!(await canMentor(actor, studentId))) return null

  const overview = await getMenteeOverview(actor, studentId, searchParams)
  if (!overview) return null

  const openable = await Promise.all(
    overview.classes.map(async (course) => ((await canAccessClass(actor, course.id)) ? course.id : null)),
  )

  return {
    overview,
    name: overview.student.full_name ?? overview.student.email,
    openableClassIds: openable.filter((id): id is string => id !== null),
  }
}

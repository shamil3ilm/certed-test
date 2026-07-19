import type { Profile } from '@/lib/auth/profile'
import { canMentor, getMenteeOverview } from '@/lib/services/mentees'

export type MenteeDetailPageData = {
  overview: NonNullable<Awaited<ReturnType<typeof getMenteeOverview>>>
  name: string
}

export async function loadMenteeDetailPageData(
  actor: Profile,
  studentId: string,
): Promise<MenteeDetailPageData | null> {
  if (!(await canMentor(actor, studentId))) return null

  const overview = await getMenteeOverview(actor, studentId)
  if (!overview) return null

  return {
    overview,
    name: overview.student.full_name ?? overview.student.email,
  }
}

import type { Profile } from '@/lib/auth/profile'
import { StatCard, StatGrid } from '@/lib/ui'
import { getAdminAnalytics, getStudentAnalytics, getTutorAnalytics } from '@/lib/services/analytics'

/**
 * The persona KPI rows at the top of each dashboard. Each is an
 * async server component so it streams in its own Suspense boundary and never
 * blocks the widgets below. Numbers only - the detail lives in the widgets and
 * their pages.
 */

/** Admin: academy content totals. Students / tutors / classes / revenue are
 *  already the interactive cards in AdminOverview, so this row adds only the
 *  library + activity figures below them. */
export async function AdminAnalyticsStats() {
  const { resources, announcements, downloads } = await getAdminAnalytics()
  return (
    <StatGrid cols={3}>
      <StatCard label="Documents" value={resources} sub="in the library" />
      <StatCard label="Announcements" value={announcements} />
      <StatCard label="Downloads" value={downloads} sub="all documents" />
    </StatGrid>
  )
}

/** Tutor: their teaching activity. */
export async function TutorAnalyticsStats({ me }: { me: Profile }) {
  const { teachingHours, sessionsHeld, resourcesUploaded, attendanceRate } = await getTutorAnalytics(me)
  return (
    <StatGrid>
      <StatCard label="Teaching hours" value={teachingHours} tone="primary" sub="recorded sessions" />
      <StatCard label="Sessions held" value={sessionsHeld} />
      <StatCard label="Documents uploaded" value={resourcesUploaded} />
      <StatCard label="Attendance" value={`${attendanceRate}%`} sub="across your classes" />
    </StatGrid>
  )
}

/** Student: their own learning activity. */
export async function StudentAnalyticsStats({ me }: { me: Profile }) {
  const { learningHours, sessionsAttended, attendanceRate, downloads } = await getStudentAnalytics(me)
  return (
    <StatGrid>
      <StatCard label="Learning hours" value={learningHours} tone="primary" sub="time in class" />
      <StatCard label="Sessions attended" value={sessionsAttended} />
      <StatCard label="Attendance" value={`${attendanceRate}%`} />
      <StatCard label="Documents downloaded" value={downloads} />
    </StatGrid>
  )
}

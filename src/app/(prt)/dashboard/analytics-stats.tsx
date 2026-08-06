import type { Profile } from '@/lib/auth/profile'
import { StatCard, StatGrid } from '@/lib/ui'
import { getAdminAnalytics, getStudentAnalytics, getTutorAnalytics } from '@/lib/services/analytics'

// Each KPI links to the surface it's ABOUT rather than piling onto /classroom:
// hours/sessions -> Calendar, documents -> library, and the actionable counts
// (to-grade / due-work) + attendance -> the class's own tab when there's a single
// class. Four cards a row so the KPI band lines up with the widget grid below.

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
      <StatCard label="Documents" value={resources} sub="in the library" href="/documents" />
      <StatCard label="Announcements" value={announcements} href="/classroom" />
      <StatCard label="Downloads" value={downloads} sub="all documents" href="/documents" />
    </StatGrid>
  )
}

/** Tutor: their teaching activity. */
export async function TutorAnalyticsStats({ me }: { me: Profile }) {
  const { teachingHours, sessionsHeld, resourcesUploaded, attendanceRate, toGrade, classIds } =
    await getTutorAnalytics(me)
  const singleClassId = classIds.length === 1 ? classIds[0] : null
  return (
    <StatGrid>
      {/* Hours + session count are one activity metric and share the Calendar, so
          they're a single card (headline hours, sessions as the sub-figure). */}
      <StatCard
        label="Teaching hours"
        value={teachingHours}
        tone="primary"
        sub={`${sessionsHeld} session${sessionsHeld === 1 ? '' : 's'} held`}
        href="/calendar"
      />
      <StatCard
        label="To grade"
        value={toGrade}
        sub="awaiting a mark"
        href={singleClassId ? `/classroom/${singleClassId}/grading` : '/classroom'}
      />
      <StatCard label="Documents uploaded" value={resourcesUploaded} href="/documents" />
      <StatCard
        label="Attendance"
        value={`${attendanceRate}%`}
        sub="across your classes"
        href={singleClassId ? `/classroom/${singleClassId}/attendance` : '/classroom'}
      />
    </StatGrid>
  )
}

/** Student: their own learning activity. */
export async function StudentAnalyticsStats({ me }: { me: Profile }) {
  const { learningHours, sessionsAttended, attendanceRate, downloads, dueWork, classIds } =
    await getStudentAnalytics(me)
  const singleClassId = classIds.length === 1 ? classIds[0] : null
  return (
    <StatGrid>
      {/* Mirrors the tutor row: hours + sessions attended fold into one card. */}
      <StatCard
        label="Learning hours"
        value={learningHours}
        tone="primary"
        sub={`${sessionsAttended} session${sessionsAttended === 1 ? '' : 's'} attended`}
        href="/calendar"
      />
      <StatCard
        label="Due work"
        value={dueWork}
        sub="to submit"
        href={singleClassId ? `/classroom/${singleClassId}/classwork` : '/classroom'}
      />
      <StatCard
        label="Attendance"
        value={`${attendanceRate}%`}
        href={singleClassId ? `/classroom/${singleClassId}/attendance` : '/classroom'}
      />
      <StatCard label="Documents downloaded" value={downloads} href="/documents" />
    </StatGrid>
  )
}

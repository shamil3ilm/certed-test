import type { Profile } from '@/lib/auth/profile'
import { StatCard, StatGrid } from '@/lib/ui'
import { getAdminAnalytics, getStudentAnalytics, getTutorAnalytics } from '@/lib/services/analytics'
import { getTutorPersonalHours } from '@/lib/services/teaching-hours'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { todayInZone } from '@/lib/time/format'
import { formatHours } from '@/lib/attendance/hours'
import { usersUrl } from '@/lib/services/page-data/admin-users'

// Each KPI links to the surface it's ABOUT rather than piling onto /classroom:
// teaching/learning hours + attendance -> the class's Attendance tab, where the
// session times and marks that produce those numbers live; graded work -> the
// Grading tab; active classes -> the class list. Headline numbers only - the
// actionable lists (due work, submissions to review, pending attendance) are the
// widgets below, never repeated as a tile.

/**
 * The persona KPI rows at the top of each dashboard. Each is an
 * async server component so it streams in its own Suspense boundary and never
 * blocks the widgets below. Numbers only - the detail lives in the widgets and
 * their pages.
 */

/** Admin: academy content totals. Students / tutors / classes / revenue are
 *  already the interactive cards in AdminOverview, so this row adds only the
 *  library + activity figures below them. */
export async function AdminAnalyticsStats({ pendingAccess, me }: { pendingAccess: number; me: Profile }) {
  const { announcements, documentDownloads } = await getAdminAnalytics(me)
  return (
    <StatGrid cols={3}>
      <StatCard
        label="Pending access"
        value={pendingAccess}
        sub="waiting for review"
        tone={pendingAccess > 0 ? 'primary' : 'default'}
        href={usersUrl({ tab: 'people', status: 'pending' })}
      />
      <StatCard label="Announcements" value={announcements} sub="currently live" href="/classroom" />
      <StatCard label="Downloads" value={documentDownloads} sub="document opens recorded" href="/documents" />
    </StatGrid>
  )
}

/** Tutor: their teaching output, mirroring the student's row (hours / graded /
 *  attendance). Pending grading is NOT a tile - it's the "Submissions to review"
 *  widget below - so the tile shows what's DONE, not another copy of the queue. */
export async function TutorAnalyticsStats({ me }: { me: Profile }) {
  const tz = await getInstituteTimeZone()
  const month = todayInZone(tz).slice(0, 7)
  const [{ teachingHours, sessionsHeld, attendanceRate, graded, classIds }, monthly] = await Promise.all([
    getTutorAnalytics(me),
    getTutorPersonalHours(me, month),
  ])
  const attendanceHref = classIds.length === 1 ? `/classroom/${classIds[0]}/attendance` : '/classroom'
  const gradingHref = classIds.length === 1 ? `/classroom/${classIds[0]}/grading` : '/classroom'
  return (
    <StatGrid cols={4}>
      {/* Sitting beside "This month", a bare "Teaching hours" reads as the monthly figure
          too - say ALL TIME so the pair is unambiguous (and so a 0.0h month, normal on the
          1st, is not mistaken for "no hours ever"). */}
      <StatCard
        label="Teaching hours (all time)"
        value={teachingHours}
        tone="primary"
        sub={`${sessionsHeld} session${sessionsHeld === 1 ? '' : 's'} held`}
        href={attendanceHref}
      />
      <StatCard
        label="This month"
        value={formatHours(monthly.minutes)}
        sub={`${monthly.sessionCount} session${monthly.sessionCount === 1 ? '' : 's'}`}
        href={attendanceHref}
      />
      <StatCard label="Graded" value={graded} sub="results recorded" href={gradingHref} />
      <StatCard label="Attendance" value={`${attendanceRate}%`} sub="across your classes" href={attendanceHref} />
    </StatGrid>
  )
}

/** Student: their own learning progress. */
export async function StudentAnalyticsStats({ me }: { me: Profile }) {
  const { learningHours, sessionsAttended, attendanceRate, gradedWork, classIds } = await getStudentAnalytics(me)
  const attendanceHref = classIds.length === 1 ? `/classroom/${classIds[0]}/attendance` : '/classroom'
  return (
    <StatGrid cols={3}>
      <StatCard
        label="Learning hours"
        value={learningHours}
        tone="primary"
        sub={`${sessionsAttended} session${sessionsAttended === 1 ? '' : 's'} attended`}
        href={attendanceHref}
      />
      <StatCard label="Graded work" value={gradedWork} sub="results recorded" href="/grades" />
      <StatCard label="Attendance" value={`${attendanceRate}%`} sub="of your sessions" href={attendanceHref} />
    </StatGrid>
  )
}

import { requireCapabilityApi } from '@/lib/auth/require-role'
import { authFail } from '@/lib/api/response'
import { rateLimitShared } from '@/lib/security/rate-limit-shared'
import { isMonth } from '@/lib/time/month-window'
import { todayInZone } from '@/lib/time/format'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { getAcademyClassHours } from '@/lib/services/teaching-hours'
import { getAcademyBreakdown } from '@/lib/services/hours-breakdown'
import { totalByKind, workingMinutes } from '@/lib/attendance/hours-breakdown'
import { toCsvRow } from '@/lib/csv'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'

export async function GET(request: Request) {
  let me
  try {
    me = await requireCapabilityApi('manageClasses')
  } catch (e) {
    return authFail(e)
  }

  const rl = await rateLimitShared(`hours-export:${me.id}`, { limit: 20, windowSeconds: 60 })
  if (!rl.ok) {
    return new Response('Too many requests. Please wait before exporting again.', { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month')
  const tz = await getInstituteTimeZone()
  const month = monthParam && isMonth(monthParam) ? monthParam : todayInZone(tz).slice(0, 7)

  const [{ tutorClasses }, { people, students }] = await Promise.all([
    getAcademyClassHours(me.id, month),
    getAcademyBreakdown(me.id, month),
  ])

  const rows: string[] = []

  // Section 1: Educators / Tutors Worked Hours
  rows.push(toCsvRow(['TEACHING & EXAM MONITORING HOURS WORKED', month]))
  rows.push(
    toCsvRow([
      'Person Name',
      'Role',
      'Sessions Count',
      'Regular (min)',
      'Regular (hrs)',
      'Exam (min)',
      'Exam (hrs)',
      'Demo (min)',
      'Demo (hrs)',
      'Working (min)',
      'Working (hrs)',
    ]),
  )
  for (const p of people) {
    const working = workingMinutes(p.minutes)
    const totalSessions = p.sessions.regular + p.sessions.demo + p.sessions.exam
    rows.push(
      toCsvRow([
        p.personName,
        p.personRole ?? 'tutor',
        totalSessions,
        p.minutes.regular,
        (p.minutes.regular / 60).toFixed(2),
        p.minutes.exam,
        (p.minutes.exam / 60).toFixed(2),
        p.minutes.demo,
        (p.minutes.demo / 60).toFixed(2),
        working,
        (working / 60).toFixed(2),
      ]),
    )
  }

  rows.push('')

  // Section 2: Students Received Hours
  rows.push(toCsvRow(['STUDENT HOURS RECEIVED', month]))
  rows.push(
    toCsvRow([
      'Student Name',
      'Sessions Count',
      'Regular (min)',
      'Regular (hrs)',
      'Demo (min)',
      'Demo (hrs)',
      'Exam (min)',
      'Exam (hrs)',
      'Total Received (min)',
      'Total Received (hrs)',
    ]),
  )
  for (const s of students) {
    const totalMin = s.total.regular + s.total.demo + s.total.exam
    const totalSessions = totalByKind(s.sessions)
    rows.push(
      toCsvRow([
        s.studentName,
        totalSessions,
        s.total.regular,
        (s.total.regular / 60).toFixed(2),
        s.total.demo,
        (s.total.demo / 60).toFixed(2),
        s.total.exam,
        (s.total.exam / 60).toFixed(2),
        totalMin,
        (totalMin / 60).toFixed(2),
      ]),
    )
  }

  rows.push('')

  // Section 3: By Class & Tutor
  rows.push(toCsvRow(['HOURS BY CLASS AND TUTOR', month]))
  rows.push(toCsvRow(['Class Name', 'Subject Name', 'Tutor Name', 'Role', 'Sessions', 'Minutes', 'Hours']))
  for (const c of tutorClasses) {
    for (const t of c.tutors) {
      rows.push(
        toCsvRow([
          c.className,
          c.subjectName ?? '',
          t.tutorName,
          t.tutorRole ?? 'tutor',
          t.sessionCount,
          t.minutes,
          (t.minutes / 60).toFixed(2),
        ]),
      )
    }
  }

  await auditPrivilegedAction(me, 'class.export_hours', 'class', null)

  return new Response(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="teaching-hours-${month}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

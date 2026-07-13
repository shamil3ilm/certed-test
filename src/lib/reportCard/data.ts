import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { getProfileById } from '@/lib/repos/users'
import { canMentor } from '@/lib/repos/mentees'
import { summarizeAttendance, type AttendanceStatus, type AttendanceSummary } from '@/lib/repos/attendance'

export type ReportMark = {
  className: string
  topic: string | null
  title: string
  score: number
  maxMarks: number | null
}

export type ReportCardData = {
  student: Profile
  marks: ReportMark[]
  average: { percent: number; gradedCount: number } | null
  attendance: AttendanceSummary
}

/**
 * Who may pull a student's report card: an admin, the student themselves, or a
 * teacher with an active mentorship over them (canMentor). Teachers-of-class see
 * the same data live in the class UI; the PDF is the pastoral/parent artefact.
 */
export async function canViewReportCard(viewer: Profile, studentId: string): Promise<boolean> {
  if (viewer.role === 'admin') return true
  if (viewer.id === studentId) return true
  return canMentor(viewer, studentId)
}

/**
 * Gathers marks (graded submissions) + an attendance summary for one student.
 * Service-role reads, but ALWAYS gated by canViewReportCard first (mirrors the
 * mentee-overview pattern, since a mentor may not teach the mentee's classes).
 */
export async function getReportCardData(viewer: Profile, studentId: string): Promise<ReportCardData | null> {
  if (!(await canViewReportCard(viewer, studentId))) return null
  const student = await getProfileById(studentId)
  if (!student) return null
  const admin = createAdminClient()

  type AssignmentRow = { id: string; title: string; topic: string | null; class_id: string; max_marks: number | null }

  // Submissions + attendance + current enrolments, in parallel.
  const [{ data: subs }, { data: att }, { data: enr }] = await Promise.all([
    admin.from('submissions').select('assignment_id, score').eq('student_id', studentId).eq('is_active', true),
    admin.from('attendance').select('status').eq('student_id', studentId),
    admin.from('enrollments').select('class_id').eq('student_id', studentId).eq('active', true),
  ])

  // Resolve the assignments the student actually has marks on by their OWN ids —
  // NOT by current enrolment — so a mark earned in a class the student has since
  // left still shows its real class/topic/max instead of a blank "Class / Assignment".
  const subAssignmentIds = [...new Set(((subs ?? []) as { assignment_id: string }[]).map((s) => s.assignment_id))]
  const { data: assignments } = subAssignmentIds.length
    ? await admin.from('assignments').select('id, title, topic, class_id, max_marks').in('id', subAssignmentIds)
    : { data: [] as AssignmentRow[] }

  // Class labels: union of current enrolments and the (possibly past) classes those marks belong to.
  const enrolledClassIds = ((enr ?? []) as { class_id: string }[]).map((r) => r.class_id)
  const assignmentClassIds = ((assignments ?? []) as AssignmentRow[]).map((a) => a.class_id)
  const classIds = [...new Set([...enrolledClassIds, ...assignmentClassIds])]
  const { data: classes } = classIds.length
    ? await admin.from('classes').select('id, name').in('id', classIds)
    : { data: [] as { id: string; name: string }[] }

  const classLabel = new Map(((classes ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]))
  const assignmentById = new Map(((assignments ?? []) as AssignmentRow[]).map((a) => [a.id, a]))

  const marks: ReportMark[] = ((subs ?? []) as { assignment_id: string; score: number | null }[])
    .filter((s) => s.score != null)
    .map((s) => {
      const a = assignmentById.get(s.assignment_id)
      return {
        className: a ? classLabel.get(a.class_id) ?? 'Class' : 'Class',
        topic: a?.topic ?? null,
        title: a?.title ?? 'Assignment',
        // PostgREST returns numeric columns as strings ("18.00") — coerce so the
        // types are honest and the arithmetic below is exact.
        score: Number(s.score),
        maxMarks: a?.max_marks != null ? Number(a.max_marks) : null,
      }
    })
    .sort((x, y) =>
      x.className === y.className ? (x.topic ?? '').localeCompare(y.topic ?? '') : x.className.localeCompare(y.className),
    )

  // A percentage only makes sense for items that carry a max mark.
  const pctItems = marks.filter((m) => m.maxMarks != null && (m.maxMarks as number) > 0)
  const average = pctItems.length
    ? {
        // Clamp at 100 defensively — a stored score above its max_marks (legacy
        // rows) must not produce a >100% average.
        percent: Math.min(
          100,
          Math.round(
            pctItems.reduce((sum, m) => sum + (m.score / (m.maxMarks as number)) * 100, 0) / pctItems.length,
          ),
        ),
        gradedCount: pctItems.length,
      }
    : null

  const attendance = summarizeAttendance((att ?? []) as { status: AttendanceStatus }[])

  return { student, marks, average, attendance }
}

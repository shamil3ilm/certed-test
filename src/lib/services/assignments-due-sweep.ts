import 'server-only'
import {
  claimAssignmentsDueSoon,
  selectEnrolledStudentsByClass,
  selectLiveClassIds,
  selectSubmittedStudentsByAssignment,
  type DueSoonAssignment,
} from '@/lib/data/assignments-due-sweep'
import { notifyBestEffort } from '@/lib/services/notifications'

/**
 * How far ahead counts as "due soon". A day: long enough that an evening's work is still
 * possible, short enough that the notice is about today rather than about the calendar. The
 * sweep runs every 15 minutes, so each assignment is announced once, roughly 24 hours out.
 */
const DUE_SOON_MS = 24 * 60 * 60 * 1000

export type DueSoonResult = { announced: number; notified: number }

/**
 * Tell each class the work falling due in the next day - and only the students who have not
 * turned it in.
 *
 * Posting an assignment already notifies the class; this is the other end of the same date.
 * Chasing someone who has already submitted is what teaches a person to ignore the feed, so
 * submitters are excluded per assignment rather than per class.
 *
 * `announced` counts assignments claimed, `notified` the students written to. They differ: an
 * assignment whose whole class has already submitted is announced and notifies nobody, which is
 * the correct outcome and worth being able to see in the cron's own response.
 */
export async function announceAssignmentsDueSoon(): Promise<DueSoonResult> {
  const now = new Date()
  const claimed = await claimAssignmentsDueSoon(now.toISOString(), new Date(now.getTime() + DUE_SOON_MS).toISOString())
  if (claimed.length === 0) return { announced: 0, notified: 0 }

  const classIds = [...new Set(claimed.map((a) => a.class_id))]
  const [liveClasses, studentsByClass, submittedByAssignment] = await Promise.all([
    selectLiveClassIds(classIds),
    selectEnrolledStudentsByClass(classIds),
    selectSubmittedStudentsByAssignment(claimed.map((a) => a.id)),
  ])

  let notified = 0
  for (const assignment of claimed) {
    if (!liveClasses.has(assignment.class_id)) continue
    const submitted = submittedByAssignment.get(assignment.id) ?? new Set<string>()
    const waiting = (studentsByClass.get(assignment.class_id) ?? []).filter((id) => !submitted.has(id))
    if (waiting.length === 0) continue
    await notifyBestEffort(waiting, bodyFor(assignment))
    notified += waiting.length
  }
  return { announced: claimed.length, notified }
}

function bodyFor(assignment: DueSoonAssignment) {
  return {
    kind: 'assignment' as const,
    title: 'Work due tomorrow',
    body: assignment.title,
    link: `/classroom/${assignment.class_id}/classwork`,
  }
}

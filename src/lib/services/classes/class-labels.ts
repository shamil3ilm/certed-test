import 'server-only'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { selectActiveEnrollmentPairsByClassIds, selectAllActiveEnrollmentPairs } from '@/lib/data/class-membership'
import { selectProfilesByFilter } from '@/lib/data/profiles-directory'
import { getProfileNamesByIds } from '@/lib/services/users'

/**
 * How a class is NAMED on a screen, resolved from the student and subject tables at read time.
 *
 * A class's stored `name` is a "Student - Subject" string written once, when the class is
 * created. Renaming the student does not rewrite it, and neither does setting a missing
 * subject, so printing it prints a snapshot - and prints the student a second time wherever
 * the page has already named them. Screens take a label from here instead, in one of two
 * forms:
 *
 *  - 'subject'          where the page already says whose class it is: the report card, a
 *                       student's own detail page, a mentor row that leads with the mentee.
 *  - 'student-subject'  where it does not: pickers and lists spanning many students.
 *
 * The stored name is the fallback, never the source - it stands in for a missing subject, and
 * for a class that is not exactly one student (a group, or none), where there is no single
 * person to lead with.
 */

export type ClassLabelMode = 'subject' | 'student-subject'

type LabelRow = { id: string; name: string; subject_id: string | null }

/** The rule, pure. `studentName` is the class's single student, or null when it has none or
 *  several. */
export function classLabel(
  row: { name: string; subject_id: string | null },
  subjectName: string | null,
  studentName: string | null,
  mode: ClassLabelMode,
): string {
  if (mode === 'subject') return subjectName ?? row.name
  if (!studentName) return row.name
  if (subjectName) return `${studentName} - ${subjectName}`
  // No subject: pair the student with the stored name - unless that name already leads with
  // them, as a "Student - Subject" name does once its subject is deleted from the catalogue.
  if (row.name === studentName || row.name.startsWith(`${studentName} - `)) return row.name
  return `${studentName} - ${row.name}`
}

/**
 * class id -> label for the given rows.
 *
 * 'subject' reads subject names only: the subjects table is a small, curated catalogue, so
 * this is bounded however many rows come in.
 *
 * 'student-subject' also needs each class's single student. `academyWide` says how to get
 * them, and the caller must say it: a BOUNDED row set (a tutor's classes, one page, one
 * class) asks by class id; an academy-wide one reads enrolments and student names whole, in
 * pages, because every class id in one `.in()` list is past the URL limit and silently cut
 * at the row cap.
 */
export async function resolveClassLabels(
  rows: ReadonlyArray<LabelRow>,
  mode: ClassLabelMode,
  opts: { academyWide?: boolean } = {},
): Promise<Map<string, string>> {
  if (rows.length === 0) return new Map()

  const subjectIds = [...new Set(rows.map((r) => r.subject_id).filter((id): id is string => id != null))]
  const [subjects, studentByClass] = await Promise.all([
    subjectIds.length ? selectSubjectsByIds(subjectIds) : Promise.resolve([]),
    mode === 'student-subject' ? singleStudentNames(rows, opts.academyWide ?? false) : Promise.resolve(new Map()),
  ])
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]))

  return new Map(
    rows.map((r) => [
      r.id,
      classLabel(
        r,
        r.subject_id ? (subjectName.get(r.subject_id) ?? null) : null,
        studentByClass.get(r.id) ?? null,
        mode,
      ),
    ]),
  )
}

/** The rows with `name` replaced by their label - NEW objects; the input is not touched. For a
 *  producer handing a `{ id, name }` list to a picker that prints `name`. */
export async function withClassLabels<T extends LabelRow>(
  rows: ReadonlyArray<T>,
  mode: ClassLabelMode,
  opts: { academyWide?: boolean } = {},
): Promise<T[]> {
  const labels = await resolveClassLabels(rows, mode, opts)
  return rows.map((r) => ({ ...r, name: labels.get(r.id) ?? r.name }))
}

/** class id -> the display name of its ONLY active student. A class with several students, or
 *  none, is absent: there is no single person to lead its label with. */
async function singleStudentNames(rows: ReadonlyArray<LabelRow>, academyWide: boolean): Promise<Map<string, string>> {
  const wanted = new Set(rows.map((r) => r.id))
  const pairs = academyWide
    ? await selectAllActiveEnrollmentPairs()
    : await selectActiveEnrollmentPairsByClassIds([...wanted])

  const studentsByClass = new Map<string, Set<string>>()
  for (const p of pairs) {
    if (!wanted.has(p.class_id)) continue
    const set = studentsByClass.get(p.class_id) ?? new Set<string>()
    set.add(p.student_id)
    studentsByClass.set(p.class_id, set)
  }
  const studentOfClass = new Map(
    [...studentsByClass].flatMap(([classId, ids]) => (ids.size === 1 ? [[classId, [...ids][0]] as const] : [])),
  )
  const studentIds = [...new Set(studentOfClass.values())]
  if (studentIds.length === 0) return new Map()

  // The same fallback as displayName (full name, else email), inlined so the academy-wide path
  // reads names from the paged student list rather than by id.
  const names = academyWide
    ? new Map((await selectProfilesByFilter({ role: 'student' })).map((p) => [p.id, p.full_name ?? p.email]))
    : await getProfileNamesByIds(studentIds)

  return new Map(
    [...studentOfClass].flatMap(([classId, studentId]) => {
      const name = names.get(studentId)
      return name ? [[classId, name] as const] : []
    }),
  )
}

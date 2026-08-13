import type { ClassSummary } from './queries'

/**
 * Presenting classes "per student" for the staff-facing views (tutor, mentor,
 * admin) - the classes list and the grading landing both read as "each student,
 * then the subjects they take / I teach them". A class is 1-on-1 (one active
 * student), so its single student is the grouping key; a class with no active
 * student falls under "Unassigned", ordered last.
 */

export type ClassStudentGroup = { key: string; label: string; classes: ClassSummary[] }

const UNASSIGNED_KEY = '__unassigned__'
// Above any real name, so unassigned classes sort to the end.
const SORT_LAST = '￿'

/** A copy sorted by student name, then subject (class name). Sort BEFORE paging
 *  so a student's classes stay contiguous across the page slice. */
export function sortClassesByStudent(classes: ClassSummary[]): ClassSummary[] {
  return [...classes].sort((a, b) => {
    const sa = (a.students[0]?.name ?? SORT_LAST).toLowerCase()
    const sb = (b.students[0]?.name ?? SORT_LAST).toLowerCase()
    return sa === sb ? a.name.localeCompare(b.name) : sa.localeCompare(sb)
  })
}

/** Groups classes under each student. Input must already be ordered by student
 *  (see sortClassesByStudent) so each student's classes are consecutive. */
export function groupClassesByStudent(classes: ClassSummary[]): ClassStudentGroup[] {
  const groups: ClassStudentGroup[] = []
  for (const c of classes) {
    const student = c.students[0]
    const key = student?.id ?? UNASSIGNED_KEY
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.classes.push(c)
    else groups.push({ key, label: student?.name ?? 'Unassigned', classes: [c] })
  }
  return groups
}

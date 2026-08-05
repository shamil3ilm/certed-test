import 'server-only'
import { selectActiveEnrollmentPairsByStudentIds } from '@/lib/data/class-membership'
import { selectClassesByIds } from '@/lib/data/classes'

type StudentRelationInput = {
  id: string
  classLevel?: string | null
}

function summarizeClassNames(classNames: string[]): string | undefined {
  if (classNames.length === 0) return undefined
  if (classNames.length === 1) return classNames[0]
  return `${classNames[0]} +${classNames.length - 1} more`
}

/**
 * Relationship/context subtitles for student cards and lists. Prefer the
 * student's active class links; keep class_level as supporting context when it
 * exists. Centralized here so dashboard/mentee surfaces stay consistent.
 */
export async function buildStudentRelationshipSubtitles(
  students: StudentRelationInput[],
): Promise<Map<string, string | undefined>> {
  const subtitles = new Map<string, string | undefined>()
  if (students.length === 0) return subtitles

  const uniqueStudents = [...new Map(students.map((student) => [student.id, student])).values()]
  const pairs = await selectActiveEnrollmentPairsByStudentIds(uniqueStudents.map((student) => student.id))
  const classIds = [...new Set(pairs.map((pair) => pair.class_id))]
  const classes = classIds.length > 0 ? await selectClassesByIds(classIds) : []
  const classNameById = new Map(classes.map((course) => [course.id, course.name]))
  const classNamesByStudent = new Map<string, string[]>()

  for (const pair of pairs) {
    const className = classNameById.get(pair.class_id)
    if (!className) continue
    classNamesByStudent.set(pair.student_id, [...(classNamesByStudent.get(pair.student_id) ?? []), className])
  }

  for (const student of uniqueStudents) {
    const classSummary = summarizeClassNames(classNamesByStudent.get(student.id) ?? [])
    subtitles.set(
      student.id,
      student.classLevel && classSummary
        ? `${student.classLevel} - ${classSummary}`
        : (classSummary ?? student.classLevel ?? undefined),
    )
  }

  return subtitles
}

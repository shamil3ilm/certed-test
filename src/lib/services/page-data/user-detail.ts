import 'server-only'
import { selectClassesByIds } from '@/lib/data/classes'
import {
  selectActiveClassIdsForStudent,
  selectActiveClassIdsForTutor,
  selectActiveTutorPairsByClassIds,
  selectActiveEnrollmentPairsByClassIds,
} from '@/lib/data/class-membership'
import { selectProfilesLiteByIds } from '@/lib/data/profiles-directory'
import { selectSubjectsByIds } from '@/lib/data/subjects'

/**
 * The two lenses on the same class_subjects rows for the admin user-detail page:
 *  - a STUDENT's subjects (each subject = one of their 1:1 classes + its tutor),
 *  - a TUTOR/MENTOR's roster (the student-subjects they teach, read-only).
 * Both compose the membership graph from existing service-role reads; the caller
 * (an admin page) has already gated access.
 */

export type StudentSubject = {
  classId: string
  subjectId: string | null
  subjectName: string
  /** A subject (1:1 class) may have MORE THAN ONE tutor for the same student. */
  tutors: { id: string; name: string }[]
}

export type TutorRosterItem = {
  classId: string
  subjectName: string
  studentName: string | null
}

const nameOf = (row: { full_name: string | null; email: string } | undefined): string | null =>
  row ? (row.full_name ?? row.email) : null

export async function loadStudentSubjects(studentId: string): Promise<StudentSubject[]> {
  const classIds = await selectActiveClassIdsForStudent(studentId)
  if (classIds.length === 0) return []
  const [classes, tutorPairs] = await Promise.all([
    selectClassesByIds(classIds),
    selectActiveTutorPairsByClassIds(classIds),
  ])
  const subjectIds = [...new Set(classes.map((c) => c.subject_id).filter((id): id is string => Boolean(id)))]
  const [subjects, tutors] = await Promise.all([
    selectSubjectsByIds(subjectIds),
    selectProfilesLiteByIds([...new Set(tutorPairs.map((t) => t.tutor_id))]),
  ])
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]))
  const tutorById = new Map(tutors.map((t) => [t.id, t]))
  // A class may have several active tutor pairs - collect ALL of them per class.
  const tutorsByClass = new Map<string, { id: string; name: string }[]>()
  for (const pair of tutorPairs) {
    const list = tutorsByClass.get(pair.class_id) ?? []
    list.push({ id: pair.tutor_id, name: nameOf(tutorById.get(pair.tutor_id)) ?? 'Tutor' })
    tutorsByClass.set(pair.class_id, list)
  }
  return classes
    .map((c) => ({
      classId: c.id,
      subjectId: c.subject_id,
      subjectName: c.subject_id ? (subjectName.get(c.subject_id) ?? c.name) : c.name,
      tutors: tutorsByClass.get(c.id) ?? [],
    }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
}

export async function loadTutorRoster(tutorId: string): Promise<TutorRosterItem[]> {
  const classIds = await selectActiveClassIdsForTutor(tutorId)
  if (classIds.length === 0) return []
  const [classes, enrollPairs] = await Promise.all([
    selectClassesByIds(classIds),
    selectActiveEnrollmentPairsByClassIds(classIds),
  ])
  const subjectIds = [...new Set(classes.map((c) => c.subject_id).filter((id): id is string => Boolean(id)))]
  const studentByClass = new Map(enrollPairs.map((e) => [e.class_id, e.student_id]))
  const [subjects, students] = await Promise.all([
    selectSubjectsByIds(subjectIds),
    selectProfilesLiteByIds([...new Set(enrollPairs.map((e) => e.student_id))]),
  ])
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]))
  const studentById = new Map(students.map((s) => [s.id, s]))
  return classes
    .map((c) => {
      const studentId = studentByClass.get(c.id) ?? null
      return {
        classId: c.id,
        subjectName: c.subject_id ? (subjectName.get(c.subject_id) ?? c.name) : c.name,
        studentName: studentId ? nameOf(studentById.get(studentId)) : null,
      }
    })
    .sort((a, b) => (a.studentName ?? '').localeCompare(b.studentName ?? ''))
}

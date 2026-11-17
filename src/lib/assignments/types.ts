/**
 * Shared assignment & classwork types and helpers.
 * Pure data and helpers - safe to import from client, server, or data layers.
 */

export const ASSIGNMENT_TYPES = ['assignment', 'exam', 'quiz', 'test', 'project'] as const
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number]

/** Sat assessments that have timed windows or sit-in-person sessions */
export const ASSESSMENT_TYPES = ['exam', 'quiz', 'test'] as const
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number]

export const CLASSWORK_TYPES = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'exam', label: 'Exam' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'test', label: 'Test' },
  { value: 'project', label: 'Project' },
] as const

export type ClassworkType = AssignmentType

/** Exam/quiz/test default to sat-in-person (no online submission); the rest expect a
 *  submission. Mirrors the server default so the form and API agree. */
export function defaultExpectsSubmission(type: ClassworkType): boolean {
  return type === 'assignment' || type === 'project'
}

/** True for sat assessments (exam, quiz, test) that carry an optional time window or in-person sitting. */
export function isTimedAssessment(type: string): boolean {
  return (ASSESSMENT_TYPES as readonly string[]).includes(type)
}

export function classworkTypeLabel(type: string): string {
  return CLASSWORK_TYPES.find((option) => option.value === type)?.label ?? 'Assignment'
}

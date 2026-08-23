// Shared classwork-type options for the create + edit assignment forms and the
// classwork badges. Pure data/helpers - safe to import from server or client.

export const CLASSWORK_TYPES = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'exam', label: 'Exam' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'test', label: 'Test' },
  { value: 'project', label: 'Project' },
] as const

export type ClassworkType = (typeof CLASSWORK_TYPES)[number]['value']

/** Exam/quiz/test default to sat-in-person (no online submission); the rest expect a
 *  submission. Mirrors the server default so the form and API agree. */
export function defaultExpectsSubmission(type: ClassworkType): boolean {
  return type === 'assignment' || type === 'project'
}

/** true for sat assessments that carry an optional time window (start + end). */
export function isTimedAssessment(type: string): boolean {
  return type === 'exam' || type === 'quiz' || type === 'test'
}

export function classworkTypeLabel(type: string): string {
  return CLASSWORK_TYPES.find((option) => option.value === type)?.label ?? 'Assignment'
}

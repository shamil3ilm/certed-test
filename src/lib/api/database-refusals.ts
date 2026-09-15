import { refusalOf } from '@/lib/data/rpc-refusal'
import { ServiceError, ValidationError } from '@/lib/errors'

/**
 * Rules the database enforces underneath a service's own check, with the message a user can act
 * on. A write that races past the service check (the class is archived between the read and the
 * insert) is refused by the database instead, and reads the same as if the check had caught it.
 */
export const DATABASE_REFUSAL_MESSAGES = {
  class_archived: 'That class is archived - restore it before adding content.',
  student_not_eligible: 'That account is revoked or is not a student, so it cannot be enrolled.',
} as const

type DatabaseRefusal = keyof typeof DATABASE_REFUSAL_MESSAGES

const CODES = Object.keys(DATABASE_REFUSAL_MESSAGES) as DatabaseRefusal[]

/** The typed error a known database refusal stands for; any other error is returned unchanged. */
export function fromDatabaseRefusal(error: unknown): unknown {
  if (error instanceof ServiceError || !(error instanceof Error)) return error
  const code = refusalOf(error, CODES)
  return code ? new ValidationError(DATABASE_REFUSAL_MESSAGES[code]) : error
}

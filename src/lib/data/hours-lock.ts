import { ValidationError } from '@/lib/errors'

/**
 * Re-raise the billed-hours lock as a ValidationError so the message reaches the person.
 *
 * A month a LIVE pay slip or receipt bills is locked (0100, 0110, 0116): a session's hours for its
 * payee, and a student's counting marks and the sessions they sit on. The triggers raise
 * check_violation (23514) with a message naming the blocking document. Every write to sessions or
 * attendance must map it: a plain Error falls through toActionError to the generic "something went
 * wrong", which tells the tutor nothing about which document is in the way or that voiding it is
 * the way forward.
 */
export function rethrowIfHoursLocked(error: { code?: string; message: string }): void {
  if (error.code === '23514' && /Session hours are locked/i.test(error.message)) {
    throw new ValidationError(error.message)
  }
}

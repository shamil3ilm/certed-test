import { rateLimit } from './rate-limit'
import { RateLimitError } from '@/lib/errors'

/**
 * Standard per-user write throttle for a mutation surface: 60 writes/minute,
 * keyed by `<scope>-write:<actorId>`. Shared by the assignment / timetable /
 * calendar (and future) write services so a client holding the relevant manage
 * capability can't spam the write path. Throws RateLimitError when over budget.
 *
 * `noun` names the surface in the message ("assignment"/"timetable"/"calendar" ->
 * "Too many <noun> changes in a short time.").
 */
export function throttleWrite(scope: string, actorId: string, noun: string): void {
  if (!rateLimit(`${scope}-write:${actorId}`, { limit: 60, windowMs: 60_000 }).ok) {
    throw new RateLimitError(`Too many ${noun} changes in a short time. Please wait a moment.`)
  }
}

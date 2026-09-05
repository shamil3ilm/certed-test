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
 *
 * This is the throttle for ordinary WRITE surfaces, and every write service should
 * use it rather than calling rateLimit() directly - one helper means the coverage
 * can be read off in one grep. Deliberately NOT used for two other kinds of limit,
 * which call rateLimit() directly with their own budget and copy:
 *   - credential changes (password/email: 5 per 10 minutes) - an anti-abuse limit,
 *     far tighter than a write budget and on a different window;
 *   - user-to-user content floods (messages 30/min, comments 20/min) - tighter than
 *     60/min and worded for the surface ("sending messages too quickly").
 * Widening those to this helper's 60/min would loosen a security control.
 */
export function throttleWrite(scope: string, actorId: string, noun: string): void {
  if (!rateLimit(`${scope}-write:${actorId}`, { limit: 60, windowMs: 60_000 }).ok) {
    throw new RateLimitError(`Too many ${noun} changes in a short time. Please wait a moment.`)
  }
}

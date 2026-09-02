import { assertTimeOrder } from '@/lib/validation/time-order'
import { minutesBetween } from '@/lib/attendance/hours'
import { ValidationError } from '@/lib/errors'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_SESSION_MINUTES = 24 * 60

// A genuine overnight class ends within a few hours of midnight; a larger "end before start"
// span is far more likely a same-day typo than a real cross-midnight session, so we only roll
// an end past midnight up to this bound - beyond it, the window is rejected as invalid.
const MIDNIGHT_ROLL_MAX_MINUTES = 6 * 60

/**
 * Resolve and validate a session's actual window from two ISO instants the client derived from
 * ONE session date.
 *
 * When the end reads as at/before the start, treat it as a CROSS-MIDNIGHT class and roll the end
 * to the next day - but only if the resulting window is a plausible overnight length; a longer
 * span stays unrolled and is rejected below as an impossible window (guarding a same-day typo
 * from being silently read as a ~day-long session). Then enforce the shared window rule:
 * end-after-start, no end-without-start, and at most 24h.
 *
 * Returns the EFFECTIVE (possibly next-day) instants to store; throws ValidationError otherwise.
 * Pure - no IO - so it is unit-testable.
 */
export function resolveSessionWindow(
  start: string | null,
  end: string | null,
): { start: string | null; end: string | null } {
  let effectiveEnd = end
  if (start != null && end != null && end <= start) {
    const rolled = new Date(new Date(end).getTime() + DAY_MS).toISOString()
    if ((minutesBetween(start, rolled) ?? Infinity) <= MIDNIGHT_ROLL_MAX_MINUTES) {
      effectiveEnd = rolled
    }
  }
  assertTimeOrder(start, effectiveEnd)
  const duration = minutesBetween(start, effectiveEnd)
  if (duration != null && duration > MAX_SESSION_MINUTES) {
    throw new ValidationError('A session cannot be longer than 24 hours - check the times.')
  }
  return { start, end: effectiveEnd }
}

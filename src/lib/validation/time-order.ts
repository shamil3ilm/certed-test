import { z } from 'zod'

/**
 * Shared cross-field time-order check for schemas carrying start_time + end_time
 * (timetable slots, calendar events). Enforces:
 *  - end_time must be after start_time (whenever both are present), and
 *  - end_time requires a start_time (only when `endRequiresStart`).
 *
 * Kept in ONE place so a create schema and its partial `update` variant can never
 * drift - an update schema silently missing this check was a recurring bug, and a
 * calendar_events row has no DB CHECK to catch it.
 *
 * `partial: true` (for update/patch schemas) treats an ABSENT start_time as
 * "unchanged" rather than "missing": only an explicit `null` (clearing the start
 * while keeping an end) trips `endRequiresStart`. On a create schema an absent
 * start genuinely means "no start", so leave `partial` off.
 */
export function refineTimeOrder(
  v: { start_time?: string | null; end_time?: string | null },
  ctx: z.RefinementCtx,
  opts: { endRequiresStart?: boolean; partial?: boolean } = {},
): void {
  const startMissing = opts.partial ? v.start_time === null : v.start_time == null
  if (opts.endRequiresStart && v.end_time != null && startMissing) {
    ctx.addIssue({ code: 'custom', message: 'end_time requires a start_time', path: ['start_time'] })
  }
  if (v.start_time != null && v.end_time != null && v.end_time <= v.start_time) {
    ctx.addIssue({ code: 'custom', message: 'end_time must be after start_time', path: ['end_time'] })
  }
}

import { z } from 'zod'
import { SUPPORTED_CURRENCIES, computeTotals } from '@/lib/money'

const lineSchema = z.object({
  subject: z.string().min(1).max(120),
  // Bounds kept well inside numeric(16,3): 1000h x 1,000,000/h = 1e9 per line,
  // x 50 lines = 5e10, far under the column's ~1e13 ceiling.
  hours: z.number().positive().max(1000),
  rate: z.number().nonnegative().max(1_000_000),
})

// Strict ISO-8601 instant (client sends new Date(dateInput).toISOString()). A
// loose Date.parse refine would let "2026-02-30" through to the Postgres `date`
// column (→ 500) or silently accept "June 20 2026".
const isoDate = z.string().datetime()

/** Issue payload for either finance kind - the party is a profile id regardless of role. */
export const issueDocSchema = z
  .object({
    party_id: z.string().uuid(),
    issue_date: isoDate,
    // Allowlist, not free text: an unknown code would make Intl.NumberFormat throw
    // on every later render, leaving the document permanently un-renderable (502).
    currency: z.enum(SUPPORTED_CURRENCIES),
    note: z.string().max(500).optional(),
    discount: z.number().nonnegative().max(1_000_000).optional(),
    lines: z.array(lineSchema).min(1).max(50),
    // The 'YYYY-MM' this document bills for, distinct from issue_date (September's
    // fees are commonly issued in October). Optional: a hand-written document that
    // bills no particular month stays valid. The same shape is checked in the
    // database (0094), so a value that reaches the column always matches.
    billing_period: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Billing period must be YYYY-MM')
      .optional(),
  })
  .superRefine((v, ctx) => {
    // Validate against the SAME rounded amounts that get stored (round(line)
    // subtotal, minor-unit-rounded discount), not the raw sum - otherwise a
    // sub-unit rate can pass "total > 0" yet store total 0, and a sub-unit
    // discount can pass here yet render inconsistently on the document.
    const { subtotal, discount, total } = computeTotals(v.lines, v.discount ?? 0, v.currency)
    if (discount > subtotal) {
      ctx.addIssue({ code: 'custom', message: 'Discount cannot exceed the subtotal', path: ['discount'] })
    } else if (total <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Total must be greater than zero', path: ['discount'] })
    }
  })
export type IssueDocInput = z.infer<typeof issueDocSchema>

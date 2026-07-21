import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from '@/lib/money'

const lineSchema = z.object({
  subject: z.string().min(1).max(120),
  // Bounds kept well inside numeric(16,3): 1000h x 1,000,000/h = 1e9 per line,
  // x 50 lines = 5e10, far under the column's ~1e13 ceiling.
  hours: z.number().positive().max(1000),
  rate: z.number().nonnegative().max(1_000_000),
})

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid date')

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
  })
  .superRefine((v, ctx) => {
    const subtotal = v.lines.reduce((s, l) => s + l.hours * l.rate, 0)
    const discount = v.discount ?? 0
    if (discount > subtotal) {
      ctx.addIssue({ code: 'custom', message: 'Discount cannot exceed the subtotal', path: ['discount'] })
    } else if (subtotal - discount <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Total must be greater than zero', path: ['discount'] })
    }
  })
export type IssueDocInput = z.infer<typeof issueDocSchema>

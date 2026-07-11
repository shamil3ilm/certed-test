import { z } from 'zod'

const lineSchema = z.object({
  subject: z.string().min(1).max(120),
  hours: z.number().positive().max(10000),
  rate: z.number().nonnegative().max(10_000_000),
})

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid date')

/** Issue payload for either finance kind — the party is a profile id regardless of role. */
export const issueDocSchema = z.object({
  party_id: z.string().uuid(),
  issue_date: isoDate,
  currency: z.string().min(1).max(8),
  note: z.string().max(500).optional(),
  discount: z.number().nonnegative().max(10_000_000).optional(),
  lines: z.array(lineSchema).min(1).max(50),
})
export type IssueDocInput = z.infer<typeof issueDocSchema>

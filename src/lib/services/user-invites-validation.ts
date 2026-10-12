import { addUserSchema } from '@/lib/validation/user'
import type { AddUserActionInput } from '@/lib/services/users/validation'

/**
 * Enough for a cohort, small enough that the codes still fit on one screen to copy - and low
 * enough that a pasted list of 500 cannot become 500 sequential writes.
 */
export const MAX_BATCH_ROWS = 25

export type BatchRowInput = Record<string, string | undefined>
export type BatchRowError = { index: number; field: string; message: string }
export type BatchValidation = { rows: AddUserActionInput[]; errors: BatchRowError[] }

/** The stored form: profiles carries CHECK (email = lower(email)). */
const normalizeEmail = (v: string | undefined): string => (v ?? '').trim().toLowerCase()

/**
 * Validate every row before anything is written.
 *
 * Collecting ALL the errors rather than throwing on the first is the point: an admin typing
 * twenty rows should see every problem at once.
 *
 * The duplicate-email rule is flagged on the LATER row, because that is the one to change -
 * and it has to be caught here rather than at the insert, where the first row would already
 * have been created and its one-time code shown before the second failed.
 *
 * Pure by design: `creatable` and `taken` come from the caller, so there is no database or
 * actor lookup to mock and every rule above is directly testable.
 */
export function validateInviteBatch(
  input: BatchRowInput[],
  context: { creatable: readonly string[]; taken: readonly string[] },
): BatchValidation {
  if (input.length === 0) {
    return { rows: [], errors: [{ index: 0, field: 'rows', message: 'Add at least one person.' }] }
  }
  if (input.length > MAX_BATCH_ROWS) {
    return {
      rows: [],
      errors: [{ index: 0, field: 'rows', message: `Add at most ${MAX_BATCH_ROWS} people at a time.` }],
    }
  }

  const takenSet = new Set(context.taken.map((e) => e.trim().toLowerCase()))
  const seen = new Set<string>()
  const errors: BatchRowError[] = []
  const rows: AddUserActionInput[] = []

  input.forEach((raw, index) => {
    const email = normalizeEmail(raw.email)
    const role = (raw.role ?? '').trim()

    if (!context.creatable.includes(role)) {
      errors.push({ index, field: 'role', message: 'You cannot add that role.' })
      return
    }

    const parsed = addUserSchema.safeParse({
      email,
      full_name: raw.full_name?.trim() || undefined,
      role,
      class_level: raw.class_level?.trim() || undefined,
      country: raw.country?.trim() || undefined,
      phone: raw.phone?.trim() || undefined,
      guardian_name: raw.guardian_name?.trim() || undefined,
      guardian_phone: raw.guardian_phone?.trim() || undefined,
      joined_on: raw.joined_on?.trim() || undefined,
    })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      errors.push({ index, field: String(issue?.path[0] ?? 'email'), message: issue?.message ?? 'Check this row.' })
      return
    }

    // Every student has a mentor - the rule validateAddUserInput enforces for the single
    // form, restated here only so the admin sees it before any row is written. inviteUser
    // still enforces it per row.
    if (role === 'student' && !raw.mentor_id?.trim()) {
      errors.push({ index, field: 'mentor_id', message: 'Choose a mentor for this student.' })
      return
    }

    if (seen.has(email)) {
      errors.push({ index, field: 'email', message: 'This email appears twice in the list.' })
      return
    }
    if (takenSet.has(email)) {
      errors.push({ index, field: 'email', message: 'A user with that email already exists.' })
      return
    }

    seen.add(email)
    rows.push({ ...parsed.data, mentor_id: raw.mentor_id?.trim() || null })
  })

  return { rows, errors }
}

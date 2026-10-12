import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { addUser, validateAddUserInput, deleteUnregisteredProfile, getProfileByEmail } from '@/lib/services/users'
import type { AddUserActionInput } from '@/lib/services/users'
import { assignMentor, assertAssignableMentor } from '@/lib/services/mentorships'
import { requireActorCapability } from '@/lib/services/authorization'
import { ServiceError } from '@/lib/errors'
import { validateInviteBatch } from './user-invites-validation'
import type { BatchRowInput, BatchRowError } from './user-invites-validation'

export type InviteResult = { profile: Profile; code: string }

/**
 * Create ONE invited account, end to end: validate, pre-flight the mentor, create, assign,
 * and roll back if the assign fails.
 *
 * It lives HERE, above both services, because `services/mentorships` already imports from
 * `services/users` - putting it inside `services/users` would close that into a cycle.
 *
 * It exists as a function at all because creating a user is five steps, not one, and a batch
 * has to run the SAME five. A caller that used `addUser` alone would create students with no
 * mentor - outside every mentor's list, seen by nobody in the pastoral view - which is exactly
 * what validateAddUserInput refusing a mentorless student is there to prevent.
 *
 * No `revalidatePath` here: a service is a pure function of (actor, input), so cache
 * invalidation stays with the caller.
 */
export async function inviteUser(actor: Profile, input: AddUserActionInput): Promise<InviteResult> {
  const { user, mentorId } = validateAddUserInput(input)

  // Pre-flight the mentor BEFORE creating the account so no profile is created (and its
  // one-time setup code burned) on a request that can't complete:
  //  - the ACTOR must hold manageMentorships. assignMentor enforces this too, but only after
  //    the account exists - so a user manager who lacks it (a sub_admin) sending a crafted
  //    POST with mentor_id would otherwise create the account, fail the assign, and roll
  //    back, discarding the setup code.
  //  - the mentor must still be assignable (the picker may have gone stale: mentor revoked or
  //    role changed since page load).
  if (mentorId) {
    await requireActorCapability(actor.id, 'manageMentorships', 'You are not allowed to assign mentors.')
    await assertAssignableMentor(mentorId)
  }

  const { profile, code } = await addUser(actor, user)

  if (mentorId) {
    try {
      await assignMentor(actor, { mentorId, studentId: profile.id })
    } catch (error) {
      // The assign still failed after creation (rare, post-preflight) - roll the new account
      // back so adding is atomic: re-adding won't collide on email.
      await deleteUnregisteredProfile(profile.id)
      throw error
    }
  }

  return { profile, code }
}

export type BatchCreated = { index: number; email: string; full_name: string | null; role: string; code: string }
export type BatchFailed = { index: number; email: string; message: string }
export type BatchOutcome = { created: BatchCreated[]; failed: BatchFailed[]; errors: BatchRowError[] }

/**
 * Add several invited accounts in one pass: validate EVERY row, pre-flight the mentors, then
 * create them one by one.
 *
 * Two phases, deliberately. Validating everything first means the common mistakes - a typo, a
 * repeated email, a student with no mentor - cost nothing and are all reported at once. A
 * fully atomic batch was considered and rejected: it would need a Postgres function taking an
 * array, which means a migration, a regenerated snapshot, re-running privilege parity and the
 * RLS suite, and a second copy of create_invited_profile's logic to keep in step. The only
 * failure it would buy is an email race between check and create, whose consequence - some
 * rows created, the rest reported - is visible in the results and fixable by resubmitting the
 * remainder.
 *
 * A row that fails mid-batch does NOT discard the rows already created. Their one-time codes
 * exist nowhere else: throwing them away to keep the batch tidy would destroy credentials that
 * are not recoverable, only replaceable.
 */
export async function inviteUsersBatch(
  actor: Profile,
  input: BatchRowInput[],
  creatable: readonly string[],
): Promise<BatchOutcome> {
  const emails = input.map((r) => (r.email ?? '').trim().toLowerCase()).filter(Boolean)
  // One lookup per DISTINCT email, before anything is written. addUser checks again at the
  // insert, which is what actually closes the race; this is to report it early and clearly.
  const checked = await Promise.all([...new Set(emails)].map(async (e) => ((await getProfileByEmail(e)) ? e : null)))
  const taken = checked.filter((e): e is string => e !== null)

  const { rows, errors } = validateInviteBatch(input, { creatable, taken })
  if (errors.length > 0) return { created: [], failed: [], errors }

  // Mentors, once, before the first write - see the note on this function. One lookup per
  // DISTINCT mentor: a cohort of twenty students typically names two or three between them,
  // and inviteUser re-checks per row anyway, so repeating the query per row buys nothing.
  const mentorIds = [...new Set(rows.map((row) => String(row.mentor_id ?? '')).filter(Boolean))]
  const refusals = new Map<string, string>()
  for (const mentorId of mentorIds) {
    try {
      await assertAssignableMentor(mentorId)
    } catch (error) {
      // assertAssignableMentor's refusals are our own copy ('no longer active', 'must be a
      // mentor or tutor'), safe to show. Anything else is masked like the create path below.
      refusals.set(mentorId, error instanceof ServiceError ? error.message : 'Choose a mentor from the list.')
    }
  }
  // Map a refusal back to every row that named that mentor, so the admin sees which rows to
  // change rather than a message with no row attached. Walked in row order, so the errors
  // arrive in the order the rows are shown.
  if (refusals.size > 0) {
    const mentorErrors = rows.flatMap((row, index) => {
      const message = refusals.get(String(row.mentor_id ?? ''))
      return message ? [{ index, field: 'mentor_id', message }] : []
    })
    return { created: [], failed: [], errors: mentorErrors }
  }

  const created: BatchCreated[] = []
  const failed: BatchFailed[] = []

  // Sequential on purpose: each create is several writes plus an audit row, and running 25
  // concurrently would turn one admin action into a burst against the same table.
  //
  // `index` is the admin's row number: validateInviteBatch skips a row only after recording an
  // error for it, so an empty `errors` means every input row is in `rows`, in input order.
  for (const [index, row] of rows.entries()) {
    try {
      const { profile, code } = await inviteUser(actor, row)
      created.push({ index, email: profile.email, full_name: profile.full_name, role: profile.role, code })
    } catch (error) {
      failed.push({
        index,
        email: String(row.email ?? ''),
        message: error instanceof ServiceError ? error.message : 'Could not add this person.',
      })
    }
  }

  return { created, failed, errors: [] }
}

import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { addUser, validateAddUserInput, deleteUnregisteredProfile } from '@/lib/services/users'
import type { AddUserActionInput } from '@/lib/services/users'
import { assignMentor, assertAssignableMentor } from '@/lib/services/mentorships'
import { requireActorCapability } from '@/lib/services/authorization'

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

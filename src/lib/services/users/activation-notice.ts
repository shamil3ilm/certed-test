import 'server-only'
import { selectProfilesLiteByIds } from '@/lib/data/profiles'
import { accountManagerIds } from '@/lib/services/account-managers'
import { notifyBestEffort } from '@/lib/services/notifications'
import { logError } from '@/lib/observability/log'

/**
 * Tell the people who manage accounts that an invited person has finished setting theirs up.
 *
 * Nothing else announces it. Registration writes no audit row, so the only other trace is the
 * status chip in the Users hub turning Active - which nobody sees unless they happen to be on
 * that page when it changes. Both ways in call this: password registration, and an OAuth first
 * login (which activates a pending invite too).
 *
 * Best-effort throughout: the account is ALREADY active by the time this runs, so a failure here
 * must never turn a completed registration into an error the new member sees.
 */
export async function notifyAccountActivated(profileId: string): Promise<void> {
  try {
    const [person] = await selectProfilesLiteByIds([profileId])
    const who = person?.full_name ?? person?.email ?? 'Someone'
    // The admin tier is who manages accounts, so it is who this concerns. The new account is
    // excluded: an admin setting up their OWN login does not need to be told about it.
    const recipients = await accountManagerIds(profileId)
    await notifyBestEffort(recipients, {
      kind: 'account',
      title: `${who} has set up their account`,
      body: person ? `${person.email} - ${person.role}` : null,
      link: `/admin/users/${profileId}`,
    })
  } catch (error) {
    logError('users.notifyAccountActivated', error, { profileId }, { toSentry: false })
  }
}

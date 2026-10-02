/** Whole years between `dob` (YYYY-MM-DD) and now, UTC. */
function ageYears(dob: string): number {
  const d = new Date(dob)
  const now = new Date()
  let age = now.getUTCFullYear() - d.getUTCFullYear()
  const monthDelta = now.getUTCMonth() - d.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1
  return age
}

/**
 * Whether an account requires a parent/guardian's consent to be set up. Shared by the
 * password-registration path AND the OAuth first-login activation, so ONE rule covers both.
 * It has to live here, not in registration.ts: a rule the OAuth path cannot see lets a minor
 * activate via Google with no consent at all (round-5 HIGH).
 *
 * The academy is KG-12, so a STUDENT is treated as a minor by DEFAULT - fail CLOSED. Only a
 * date_of_birth proving 18+ lifts the requirement (an adult student, rare). A recorded guardian
 * is a strengthening signal but not required to trigger it. Non-students never require it.
 *
 * A student with NEITHER a DOB nor a guardian on record therefore still requires consent:
 * missing records are the ordinary state of a fresh invite, and reading absence as "adult"
 * fails open exactly where the protection matters most (round-5).
 */
export function requiresGuardianConsent(target: {
  role: string
  date_of_birth: string | null
  guardian_name: string | null
}): boolean {
  if (target.role !== 'student') return false
  if (target.date_of_birth) return ageYears(target.date_of_birth) < 18
  // No date of birth: a KG-12 student is a minor unless proven otherwise.
  return true
}

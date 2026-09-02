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
 * password-registration path AND the OAuth first-login activation, so one rule covers both
 * (an earlier version lived only in registration.ts, letting a minor activate via Google with
 * no consent - round-5 HIGH).
 *
 * The academy is KG-12, so a STUDENT is treated as a minor by DEFAULT - fail CLOSED. Only a
 * date_of_birth proving 18+ lifts the requirement (an adult student, rare). A recorded guardian
 * is a strengthening signal but not required to trigger it. Non-students never require it.
 * (Previously this returned false when a student had neither DOB nor guardian on record - a
 * fail-open the round-5 audit flagged.)
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

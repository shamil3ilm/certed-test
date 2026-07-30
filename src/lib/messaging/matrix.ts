/**
 * Admin-configurable messaging matrix. Layered ADDITIVELY on top of the fixed
 * direct-contact default (see recipient-policy): each enabled persona pair lets
 * everyone holding persona A message everyone holding persona B (globally), in
 * addition to their direct contacts. Default (empty matrix) = direct contacts only.
 *
 * Messaging is bidirectional (a 1:1 thread re-checks eligibility on every send),
 * so pairs are UNORDERED and stored under a canonical, sorted key. This module is
 * pure (no I/O) so the parsing/serialising is unit-testable and reusable on the
 * client for the admin grid.
 */

export const MESSAGING_PERSONAS = ['admin', 'sub_admin', 'tutor', 'mentor', 'student'] as const
export type MessagingPersona = (typeof MESSAGING_PERSONAS)[number]

const VALID_PERSONA = new Set<string>(MESSAGING_PERSONAS)

/** The enabled set of unordered persona pairs, keyed canonically. */
export type MessagingMatrix = Set<string>

/** Canonical key for an unordered persona pair. */
export function pairKey(a: MessagingPersona, b: MessagingPersona): string {
  return [a, b].sort().join('|')
}

export function matrixAllows(matrix: MessagingMatrix, a: MessagingPersona, b: MessagingPersona): boolean {
  return matrix.has(pairKey(a, b))
}

/**
 * Parse the stored JSONB (a `{ "a|b": true }` object, or null/absent before the
 * column exists) into the enabled set. Anything unrecognised - non-true values,
 * malformed keys, unknown persona names - is dropped, so a bad stored value can
 * only ever narrow messaging, never widen it to an undefined pair.
 */
export function parseMessagingMatrix(raw: unknown): MessagingMatrix {
  const set: MessagingMatrix = new Set()
  if (!raw || typeof raw !== 'object') return set
  for (const [key, on] of Object.entries(raw as Record<string, unknown>)) {
    if (on !== true) continue
    const parts = key.split('|')
    if (parts.length !== 2) continue
    const [a, b] = parts
    if (!VALID_PERSONA.has(a) || !VALID_PERSONA.has(b)) continue
    set.add(pairKey(a as MessagingPersona, b as MessagingPersona))
  }
  return set
}

/** Serialise an enabled set back to the stored JSONB shape (canonical keys -> true). */
export function serializeMessagingMatrix(pairs: Iterable<string>): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  const set = parseMessagingMatrix(Object.fromEntries([...pairs].map((k) => [k, true])))
  for (const key of set) out[key] = true
  return out
}

/** The persona names an actor holds, from their resolved persona flags. */
export function personasFromFlags(flags: {
  isAdmin: boolean
  isSubAdmin: boolean
  isTutor: boolean
  hasMentorAuthority: boolean
  isStudent: boolean
}): MessagingPersona[] {
  const out: MessagingPersona[] = []
  if (flags.isAdmin) out.push('admin')
  if (flags.isSubAdmin) out.push('sub_admin')
  if (flags.isTutor) out.push('tutor')
  if (flags.hasMentorAuthority) out.push('mentor')
  if (flags.isStudent) out.push('student')
  return out
}

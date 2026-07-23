import type { Profile } from '@/lib/auth/profile'

// Single runtime source of truth for capabilities (the type is derived from it),
// so the override service can validate a capability string at the boundary.
export const ALL_CAPABILITIES = [
  'viewDashboard',
  'viewMessages',
  'viewClasses',
  'viewCalendar',
  'manageCalendar',
  'viewGrading',
  'manageClassContent',
  'viewUsers',
  'manageUsers',
  'viewFinance',
  'viewHistory',
  'viewMentees',
  'manageMentorships',
  'viewPayslips',
  'viewReceipts',
  'manageAdminTier',
] as const

export type Capability = (typeof ALL_CAPABILITIES)[number]

export function isCapability(value: string): value is Capability {
  return (ALL_CAPABILITIES as readonly string[]).includes(value)
}

/**
 * Hard rules: capabilities a persona alone confers and that a normal capability
 * override can never grant or remove (only admins hold them, via their persona).
 * Precedence: hard rule > explicit deny > explicit allow > persona default.
 */
export const HARD_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(['manageAdminTier'])

const PERSONA_CAPABILITIES: Record<string, ReadonlySet<Capability>> = {
  admin: new Set<Capability>([
    'viewDashboard',
    'viewMessages',
    'viewClasses',
    'viewCalendar',
    'manageCalendar',
    'viewGrading',
    'manageClassContent',
    'viewUsers',
    'manageUsers',
    'viewFinance',
    'viewHistory',
    'viewMentees',
    // Assigning a mentor is a pastoral ACCESS decision (it grants a scoped mentor
    // persona over a student's data), so it is admin-tier by default rather than
    // riding on general manageUsers. It stays override-grantable, so an admin can
    // delegate it to a sub_admin explicitly and with an audited reason.
    'manageMentorships',
    // NOT viewPayslips/viewReceipts: those are the self-service "my own docs"
    // pages (tutor's payslips, student's receipts). An admin manages all finance
    // via /admin/finance, so surfacing those nav links only led to note-only
    // pages. Admin PDF access is enforced in render.ts, not via these caps.
    'manageAdminTier',
  ]),
  sub_admin: new Set<Capability>(['viewDashboard', 'viewMessages', 'viewUsers', 'manageUsers']),
  tutor: new Set<Capability>([
    'viewDashboard',
    'viewMessages',
    'viewClasses',
    'viewCalendar',
    'manageCalendar',
    'viewGrading',
    'manageClassContent',
    // NOT viewMentees: a plain tutor has no mentee access. It comes only from the
    // (student-scoped) mentor persona, auto-assigned when they're given a
    // mentorship - so a tutor sees /students only when they're also a mentor.
    'viewPayslips',
  ]),
  mentor: new Set<Capability>([
    'viewDashboard',
    'viewMessages',
    'viewMentees',
    // A dedicated mentor is paid via the same pay-slip flow as a tutor, so they
    // need to see their own pay slips (self-scoped, like a tutor's).
    'viewPayslips',
  ]),
  student: new Set<Capability>(['viewDashboard', 'viewMessages', 'viewClasses', 'viewCalendar', 'viewReceipts']),
  // RESERVED, INTENTIONALLY NOT LISTED: `guardian`, `finance_operator`,
  // `assistant`, `executive` exist in the persona_name DB enum (migration 0014)
  // as forward-looking headroom, but nothing in the app can assign them
  // (roleToPersona yields only the four base personas; assignMentorPersona yields
  // only `mentor`). Advertising capabilities for personas no profile can hold
  // would misrepresent what the routes/loaders honor -- and reads as a live
  // access path that doesn't exist. When one of these becomes real, wire it end
  // to end (PersonaName, an assignment path, the dashboard loader, and its route
  // guards) and add its entry here in the same change. An unrecognized persona
  // aggregates to no capabilities (fail-closed) until then.
}

// Capabilities for a single profile keyed by its role - the fixed identity a
// profile is created with. Used by the Profile-arg overload of hasCapability for
// display/lookup; the personas-array overload aggregates instead (multi-persona).
const ROLE_CAPABILITIES: Record<Profile['role'], ReadonlySet<Capability>> = {
  admin: PERSONA_CAPABILITIES['admin'],
  sub_admin: PERSONA_CAPABILITIES['sub_admin'],
  tutor: PERSONA_CAPABILITIES['tutor'],
  // mentor is an independent identity (may or may not also be a tutor). Its base
  // capabilities are pastoral oversight only - teaching powers come solely from a
  // separately-held tutor persona.
  mentor: PERSONA_CAPABILITIES['mentor'],
  student: PERSONA_CAPABILITIES['student'],
}

function aggregateCapabilities(personas: Array<{ persona_name: string }>): ReadonlySet<Capability> {
  const aggregated = new Set<Capability>()
  for (const persona of personas) {
    const caps = PERSONA_CAPABILITIES[persona.persona_name]
    if (caps) {
      caps.forEach((cap) => aggregated.add(cap))
    }
  }
  return aggregated
}

/**
 * Two overloads, two different meanings:
 *  - Profile arg  -> the role's BASELINE capabilities (ROLE_CAPABILITIES[role]).
 *    Identity/display only; NOT override-aware.
 *  - personas arg -> the aggregate of those personas' capabilities.
 *
 * For an access/visibility GATE that must honour admin capability overrides, use
 * the actor's RESOLVED set instead - `actor.capabilities.allowed` from
 * getActorContext() (route guards, nav, and the calendar/finance view-models
 * already do). The Profile overload is fine for identity checks such as
 * isAdminTier, which gates on the hard-rule manageAdminTier and thus can never be
 * widened by an override anyway.
 */
export function getCapabilities(arg: Profile | Array<{ persona_name: string }>): ReadonlySet<Capability> {
  if (Array.isArray(arg)) {
    return aggregateCapabilities(arg)
  }
  return ROLE_CAPABILITIES[arg.role]
}

export function hasCapability(arg: Profile | Array<{ persona_name: string }>, capability: Capability): boolean {
  return getCapabilities(arg).has(capability)
}

export function isAdminTier(arg: Profile | Array<{ persona_name: string }>): boolean {
  return hasCapability(arg, 'manageAdminTier')
}

// -- Capability overrides (persona baseline + explicit allow/deny) --------------

/** Baseline capabilities a profile's active personas confer. */
export function getBaseCapabilities(personas: Array<{ persona_name: string }>): ReadonlySet<Capability> {
  return aggregateCapabilities(personas)
}

export type CapabilityOverride = { capability: Capability; effect: 'allow' | 'deny' }
export type CapabilitySource = 'persona' | 'override_allow' | 'override_deny'

export type ResolvedCapabilitySet = {
  allowed: ReadonlySet<Capability>
  denied: ReadonlySet<Capability>
  /** Why each capability resolved as it did - for the admin override UI. */
  sourceByCapability: Map<Capability, CapabilitySource>
}

/**
 * Resolve effective capabilities from the persona baseline plus explicit
 * overrides, in precedence order: hard rule > deny > allow > persona default.
 * A hard capability is never affected by an override (only a persona confers it).
 * Deny beats allow; allow grants a capability absent from the baseline.
 */
export function resolveCapabilities(input: {
  personas: Array<{ persona_name: string }>
  overrides: CapabilityOverride[]
}): ResolvedCapabilitySet {
  const baseline = aggregateCapabilities(input.personas)
  const allowed = new Set<Capability>(baseline)
  const denied = new Set<Capability>()
  const sourceByCapability = new Map<Capability, CapabilitySource>()
  for (const cap of baseline) sourceByCapability.set(cap, 'persona')

  // Explicit allow - grants a capability absent from the baseline (never a hard one).
  for (const o of input.overrides) {
    if (o.effect !== 'allow' || HARD_CAPABILITIES.has(o.capability)) continue
    if (!allowed.has(o.capability)) {
      allowed.add(o.capability)
      sourceByCapability.set(o.capability, 'override_allow')
    }
  }
  // Explicit deny - beats allow and baseline (never removes a hard one).
  for (const o of input.overrides) {
    if (o.effect !== 'deny' || HARD_CAPABILITIES.has(o.capability)) continue
    allowed.delete(o.capability)
    denied.add(o.capability)
    sourceByCapability.set(o.capability, 'override_deny')
  }
  return { allowed, denied, sourceByCapability }
}

export function hasResolvedCapability(resolved: ResolvedCapabilitySet, capability: Capability): boolean {
  return resolved.allowed.has(capability)
}

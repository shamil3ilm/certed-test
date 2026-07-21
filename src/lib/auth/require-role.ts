import { redirect } from 'next/navigation'
import { getActorContext } from '@/lib/session/actor-context'
import { type Capability } from '@/lib/capabilities'
import { redirectForAccessState } from './guards'
import type { Profile } from './profile'

/**
 * Guards are expressed with role names for readability, but authorization is
 * decided against the caller's active personas. The role->persona name mapping
 * is 1:1 except `tutor` -> `tutor`.
 */
function normalizeRolesToPersonas(roles: Profile['role'][]): string[] {
  return roles.map((role) => (role === 'tutor' ? 'tutor' : role))
}

/** True if the caller holds any persona in the allowed set. */
function hasAllowedPersona(allowed: Profile['role'][], personas: Array<{ persona_name: string }>): boolean {
  const allowedPersonas = normalizeRolesToPersonas(allowed)
  return personas.some((p) => allowedPersonas.includes(p.persona_name))
}

/**
 * Page/Server-Action guard: enforces active status + one of the allowed personas,
 * redirecting (not throwing) on failure. Returns the caller's profile.
 */
export async function requireRole(allowed: Profile['role'][]): Promise<Profile> {
  const actor = await getActorContext()
  if (!actor.profile || actor.accessState !== 'active') redirectForAccessState(actor)
  if (!hasAllowedPersona(allowed, actor.personas)) redirect('/dashboard')
  return actor.profile
}

/**
 * Session guard for pages available to ANY signed-in, active user regardless of
 * persona - self-service like managing your own profile/password. Enforces active
 * status only (no persona/capability gate), so it can never wrongly exclude a
 * current or future persona. Prefer this over enumerating every role for
 * "anyone logged in" pages.
 */
export async function requireActiveProfile(): Promise<Profile> {
  const actor = await getActorContext()
  if (!actor.profile || actor.accessState !== 'active') redirectForAccessState(actor)
  return actor.profile
}

/**
 * Capability-based page guard - the persona-first counterpart to requireRole.
 * Use this where access is defined by a capability rather than a fixed role set,
 * so the page guard agrees with the capability-driven nav (nav.ts) and services.
 * Notably `/students` is `viewMentees`, which admin and mentor hold outright,
 * while a tutor holds it ONLY when also assigned the (student-scoped) mentor
 * persona -- a plain tutor has no mentee access, and a fixed role list can't
 * express that persona nuance.
 *
 * Decides against the actor's RESOLVED capabilities (persona baseline + admin
 * overrides), so an explicit allow/deny is honoured here exactly as in the nav.
 */
export async function requireCapability(capability: Capability): Promise<Profile> {
  const actor = await getActorContext()
  if (!actor.profile || actor.accessState !== 'active') redirectForAccessState(actor)
  if (!actor.capabilities.allowed.has(capability)) redirect('/dashboard')
  return actor.profile
}

/**
 * API/Route-Handler guard: same checks as requireRole but throws coded errors
 * ('no-access' | 'revoked' | 'forbidden') instead of redirecting, so callers can
 * return a JSON error via `authFail`. Status is checked before persona so a
 * disabled account gets 'revoked' rather than 'forbidden'.
 */
export async function requireRoleApi(allowed: Profile['role'][]): Promise<Profile> {
  const actor = await getActorContext()
  if (!actor.profile) throw new Error('no-access')
  if (actor.accessState === 'disabled') throw new Error('revoked')
  if (actor.accessState !== 'active') throw new Error('no-access')
  if (!hasAllowedPersona(allowed, actor.personas)) throw new Error('forbidden')
  return actor.profile
}

/**
 * Capability-based API/Route-Handler guard - the throwing counterpart to
 * requireCapability, and the API analogue of requireRoleApi. Decides against the
 * actor's RESOLVED capabilities (persona baseline + admin overrides), so an API
 * route agrees with the page guard and nav: an override-granted capability that
 * opens the UI entry point also opens the matching API endpoint (no divergence).
 * Use for override-sensitive endpoints; keep requireRoleApi for structural
 * admin-only rules that are deliberately NOT override-grantable.
 */
export async function requireCapabilityApi(capability: Capability): Promise<Profile> {
  const actor = await getActorContext()
  if (!actor.profile) throw new Error('no-access')
  if (actor.accessState === 'disabled') throw new Error('revoked')
  if (actor.accessState !== 'active') throw new Error('no-access')
  if (!actor.capabilities.allowed.has(capability)) throw new Error('forbidden')
  return actor.profile
}

import { redirect } from 'next/navigation'
import type { ActorContext } from '@/lib/session/actor-context'
import type { Profile } from './profile'

/**
 * Access-state guards for API route handlers. Authorization (which persona may
 * do what) is decided by requireRole/requireRoleApi and the persona helpers;
 * these only assert the caller's account is present and active.
 */
export function assertActiveProfile(actor: ActorContext): Profile {
  if (actor.accessState === 'disabled') throw new Error('revoked')
  if (actor.accessState !== 'active' || !actor.profile) throw new Error('no-access')
  return actor.profile
}

export function redirectForAccessState(actor: ActorContext): never {
  if (actor.accessState === 'unauthenticated') redirect('/login')
  if (actor.accessState === 'disabled') redirect('/access-revoked')
  redirect('/access-pending')
}

import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import {
  countProfiles,
  selectActiveProfilesByRoles,
  selectAllProfiles,
  selectProfileByEmail,
  selectProfileById,
  selectProfilePage,
  selectProfilesLiteByIds,
  type ProfileLiteRow,
  type ProfilePageOptions,
} from '@/lib/data/profiles'

/** Reading people: lists, pages, counts and lookups. No mutations - account
 *  lifecycle lives in ./admin-lifecycle. Table access is in src/lib/data/profiles. */

export type PaginatedProfiles = { items: Profile[]; total: number }
/** `tutors` counts TEACHING+MENTORING staff: tutors and dedicated mentors. Mentor is
 *  a first-class role, so counting only role='tutor' understated staff. */
export type PeopleCounts = { students: number; tutors: number; pending: number }
export type UsersHubStats = { students: number; tutors: number; adminTier: number }
export type ProfileLite = ProfileLiteRow

export async function listProfiles(): Promise<Profile[]> {
  return selectAllProfiles()
}

/** One role-tier's profiles, a page at a time - the Users hub used to fetch every
 *  profile in the academy just to filter down to the open tab. */
export async function listProfilesByRole(
  role: Profile['role'] | ReadonlyArray<Profile['role']>,
  opts: ProfilePageOptions,
): Promise<PaginatedProfiles> {
  return selectProfilePage(role, opts)
}

/** Cheap counts for the dashboard stat cards - head counts, so no rows transfer. */
export async function countPeople(): Promise<PeopleCounts> {
  const [students, tutors, pending] = await Promise.all([
    countProfiles({ role: 'student' }),
    countProfiles({ role: ['tutor', 'mentor'] }),
    countProfiles({ status: 'pending' }),
  ])
  return { students, tutors, pending }
}

/** Same head-count approach, for the Users hub's stat cards (admin-tier instead
 *  of pending). */
export async function countUsersHubStats(): Promise<UsersHubStats> {
  const [students, tutors, adminTier] = await Promise.all([
    countProfiles({ role: 'student' }),
    countProfiles({ role: ['tutor', 'mentor'] }),
    countProfiles({ role: ['admin', 'sub_admin'] }),
  ])
  return { students, tutors, adminTier }
}

/** A person's display name: their full name, or their email as a fallback. */
export const displayName = (p: { full_name: string | null; email: string }): string => p.full_name ?? p.email

/**
 * Profiles for the given ids, keyed by id - the one place that resolves users the
 * caller may not otherwise read under RLS (e.g. a tutor seeing the names of
 * students who submitted). Callers gate access first.
 */
export async function getProfilesByIds(ids: string[]): Promise<Map<string, ProfileLite>> {
  const rows = await selectProfilesLiteByIds(ids)
  return new Map(rows.map((p) => [p.id, p]))
}

/** Display names keyed by id (built on getProfilesByIds). */
export async function getProfileNamesByIds(ids: string[]): Promise<Map<string, string>> {
  const profiles = await getProfilesByIds(ids)
  return new Map([...profiles].map(([id, p]) => [id, displayName(p)]))
}

export async function getProfileById(id: string): Promise<Profile | null> {
  return selectProfileById(id)
}

/** Active people of one role (id + display name), for class-management pickers.
 *  Callers gate with canManageClass first. */
export async function listActiveByRole(role: 'tutor' | 'student'): Promise<{ id: string; name: string }[]> {
  const rows = await selectActiveProfilesByRoles([role])
  return rows.map((p) => ({ id: p.id, name: displayName(p) }))
}

/** Active people who can be assigned as a student's mentor: tutors (who may also
 *  mentor) and dedicated mentors. Callers gate (admin/sub_admin). */
export async function listActiveMentorCandidates(): Promise<{ id: string; name: string }[]> {
  const rows = await selectActiveProfilesByRoles(['tutor', 'mentor'])
  return rows.map((p) => ({ id: p.id, name: displayName(p) }))
}

/** Finds an existing allowlisted profile by normalized email. */
export async function getProfileByEmail(email: string): Promise<Profile | null> {
  return selectProfileByEmail(email)
}

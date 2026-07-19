import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { studentIdsOfTutor } from '@/lib/services/mentorships'
import { getProfileNamesByIds } from '@/lib/services/users'

export type Contact = { id: string; name: string }

/**
 * The set of profile ids `actor` may START a conversation with, by persona.
 * This is the single place messaging eligibility lives, so a NEW persona plugs
 * in by adding a branch here — never a schema change.
 *
 *   admin     -> anyone (any active profile)
 *   sub_admin -> the users they manage (tutors + students)
 *   tutor     -> students in classes they teach + their mentees
 *   mentor    -> their mentees
 *   student   -> the tutors of their classes + their mentors + admins/sub_admins
 *
 * A persona with none of these flags (e.g. a future guardian) reaches nobody
 * until its branch is added.
 */
async function eligibleRecipientIds(actor: Profile): Promise<Set<string>> {
  const flags = await loadPersonaFlags(actor.id)
  const admin = createAdminClient()
  const ids = new Set<string>()

  if (flags.isAdmin) {
    const { data } = await admin.from('profiles').select('id').eq('status', 'active')
    for (const r of (data ?? []) as { id: string }[]) ids.add(r.id)
    ids.delete(actor.id)
    return ids
  }

  if (flags.isSubAdmin) {
    // Sub-admins message the users they manage: tutors + students. Expressed as
    // "every active profile that isn't an admin/sub_admin" rather than a positive
    // .in('role', ['tutor', 'student']) -- the positive form would SILENTLY drop
    // tutors in any environment where the teacher->tutor role migration hasn't
    // run yet, whereas admin/sub_admin are stable values, so this stays correct
    // regardless of DB migration state.
    const { data } = await admin.from('profiles').select('id, role').eq('status', 'active')
    for (const r of (data ?? []) as { id: string; role: string }[]) {
      if (r.role !== 'admin' && r.role !== 'sub_admin') ids.add(r.id)
    }
    ids.delete(actor.id)
    return ids
  }

  if (flags.isTutor) {
    const { data: ct } = await admin.from('class_tutors').select('class_id').eq('tutor_id', actor.id).eq('active', true)
    const classIds = [...new Set(((ct ?? []) as { class_id: string }[]).map((r) => r.class_id))]
    if (classIds.length) {
      const { data: enr } = await admin.from('enrollments').select('student_id').in('class_id', classIds).eq('active', true)
      for (const r of (enr ?? []) as { student_id: string }[]) ids.add(r.student_id)
    }
  }

  // tutor + mentor authority both include the actor's mentees.
  if (flags.isTutor || flags.isMentor) {
    for (const id of await studentIdsOfTutor(actor.id)) ids.add(id)
  }

  if (flags.isStudent) {
    const { data: enr } = await admin.from('enrollments').select('class_id').eq('student_id', actor.id).eq('active', true)
    const classIds = [...new Set(((enr ?? []) as { class_id: string }[]).map((r) => r.class_id))]
    if (classIds.length) {
      const { data: ct } = await admin.from('class_tutors').select('tutor_id').in('class_id', classIds).eq('active', true)
      for (const r of (ct ?? []) as { tutor_id: string }[]) ids.add(r.tutor_id)
    }
    const { data: ms } = await admin.from('mentorships').select('tutor_id').eq('student_id', actor.id).eq('active', true)
    for (const r of (ms ?? []) as { tutor_id: string }[]) ids.add(r.tutor_id)
    const { data: staff } = await admin.from('profiles').select('id').in('role', ['admin', 'sub_admin']).eq('status', 'active')
    for (const r of (staff ?? []) as { id: string }[]) ids.add(r.id)
  }

  ids.delete(actor.id)
  return ids
}

/** May `actor` open/continue a conversation with `recipientId`? */
export async function canMessage(actor: Profile, recipientId: string): Promise<boolean> {
  if (!recipientId || recipientId === actor.id) return false
  const ids = await eligibleRecipientIds(actor)
  return ids.has(recipientId)
}

/** The allowed recipient list for `actor`'s composer, name-resolved and sorted. */
export async function listMessageableContacts(actor: Profile): Promise<Contact[]> {
  const ids = [...(await eligibleRecipientIds(actor))]
  if (ids.length === 0) return []
  const names = await getProfileNamesByIds(ids)
  return ids
    .map((id) => ({ id, name: names.get(id) ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

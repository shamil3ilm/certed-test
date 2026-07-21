import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfilesByIds } from '@/lib/services/users'
import { loadPersonaFlags, requireAdminPersona } from '@/lib/permission/personas'
import type { Profile } from '@/lib/auth/profile'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { ValidationError } from '@/lib/errors'
import { createClassSchema } from '@/lib/validation/class'
import { z } from 'zod'

export type ClassRow = {
  id: string
  name: string
  status: 'active' | 'archived'
  created_at: string
}

const classIdSchema = z.string().uuid()

export type CreateClassActionInput = {
  name?: FormDataEntryValue | null
}

export type RenameClassActionInput = {
  id?: FormDataEntryValue | null
  name?: FormDataEntryValue | null
}

export type ClassIdActionInput = {
  id?: FormDataEntryValue | null
}

export function validateCreateClassInput(input: CreateClassActionInput): { name: string } {
  const parsed = createClassSchema.safeParse({ name: String(input.name ?? '') })
  if (!parsed.success) {
    throw new ValidationError(`Invalid class data: ${parsed.error.message}`)
  }
  return parsed.data
}

export function validateRenameClassInput(input: RenameClassActionInput): { id: string; name: string } {
  const id = classIdSchema.safeParse(String(input.id ?? ''))
  const name = createClassSchema.safeParse({ name: String(input.name ?? '') })
  if (!id.success || !name.success) {
    throw new ValidationError('Invalid class rename data')
  }
  return { id: id.data, name: name.data.name }
}

export function validateClassIdInput(input: ClassIdActionInput): string {
  const parsed = classIdSchema.safeParse(String(input.id ?? ''))
  if (!parsed.success) {
    throw new ValidationError('Invalid class id')
  }
  return parsed.data
}

export async function listClasses(): Promise<ClassRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('classes').select('*').order('name')
  if (error) throw new Error(`classes.list: ${error.message}`)
  return (data ?? []) as ClassRow[]
}

/** Count of active classes - SQL-side, transfers zero rows. RLS-scoped: an
 *  admin sees the whole-academy count (what the dashboard stat card needs). */
export async function countActiveClasses(): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('classes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  if (error) throw new Error(`classes.countActive: ${error.message}`)
  return count ?? 0
}

// Cached per-request: the class layout and its child page (Stream/Classwork/
// People) both resolve the same class, so this collapses to one read.
export const getClass = cache(async (id: string): Promise<ClassRow | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from('classes').select('*').eq('id', id).maybeSingle()
  return (data as ClassRow) ?? null
})

// Use requireAdminPersona from personas.ts instead of local implementation

/**
 * Whole-class management (create, rename, archive/restore) is ADMIN-ONLY - a
 * single tutor shouldn't be able to rename/hide a shared class or change its
 * teaching staff. Day-to-day student enrolment lives in enrollments.ts.
 */
export async function createClass(actor: Profile, name: string): Promise<ClassRow> {
  await requireAdminPersona(actor)
  const admin = createAdminClient()
  // Explicit status (don't rely on the DB default) so mock mode also marks it active.
  const { data, error } = await admin.from('classes').insert({ name, status: 'active' }).select('*').single()
  if (error) throw new Error(`classes.create: ${error.message}`)
  const created = data as ClassRow
  await auditPrivilegedAction(actor, 'class.create', 'class', created.id)
  return created
}

export async function createClassFromActionInput(
  actor: Profile,
  input: CreateClassActionInput,
): Promise<ClassRow> {
  const parsed = validateCreateClassInput(input)
  return createClass(actor, parsed.name)
}

export async function renameClass(actor: Profile, id: string, name: string): Promise<void> {
  await requireAdminPersona(actor)
  const admin = createAdminClient()
  const { error } = await admin.from('classes').update({ name }).eq('id', id)
  if (error) throw new Error(`classes.rename: ${error.message}`)
  await auditPrivilegedAction(actor, 'class.rename', 'class', id)
}

export async function renameClassFromActionInput(
  actor: Profile,
  input: RenameClassActionInput,
): Promise<void> {
  const parsed = validateRenameClassInput(input)
  await renameClass(actor, parsed.id, parsed.name)
}

export async function archiveClass(actor: Profile, id: string): Promise<void> {
  await requireAdminPersona(actor)
  const admin = createAdminClient()
  const { error } = await admin.from('classes').update({ status: 'archived' }).eq('id', id)
  if (error) throw new Error(`classes.setStatus: ${error.message}`)
  await auditPrivilegedAction(actor, 'class.archive', 'class', id)
}

export async function archiveClassFromActionInput(actor: Profile, input: ClassIdActionInput): Promise<void> {
  await archiveClass(actor, validateClassIdInput(input))
}

export async function restoreClass(actor: Profile, id: string): Promise<void> {
  await requireAdminPersona(actor)
  const admin = createAdminClient()
  const { error } = await admin.from('classes').update({ status: 'active' }).eq('id', id)
  if (error) throw new Error(`classes.setStatus: ${error.message}`)
  await auditPrivilegedAction(actor, 'class.restore', 'class', id)
}

export async function restoreClassFromActionInput(actor: Profile, input: ClassIdActionInput): Promise<void> {
  await restoreClass(actor, validateClassIdInput(input))
}

/**
 * Class-centric aggregation layer (Google Classroom-style).
 *
 * A "class" is a `classes` row. Membership is derived from the existing
 * `class_tutors` and `enrollments` tables - there is no new core schema.
 * These helpers use the service-role client but ALWAYS scope by the caller's
 * own membership first, so they never widen what a user can see.
 */

export type ClassSummary = ClassRow & {
  tutorCount: number
  studentCount: number
}

export type ClassMember = { id: string; rowId: string; name: string; email: string; role: string }
export type ClassMembers = { tutors: ClassMember[]; students: ClassMember[] }

/** ClassRow ids the caller belongs to (admin sees all).
 *  Tutor and student membership are derived from explicit personas and unioned,
 *  so a user who holds both personas sees both sets, and a user who holds
 *  neither (e.g. a future guardian/finance persona) sees none - membership is
 *  never inferred from the absence of another persona. */
export async function myClassIds(profile: Profile): Promise<string[]> {
  const { isAdmin, isTutor, isStudent } = await loadPersonaFlags(profile.id)

  const admin = createAdminClient()
  if (isAdmin) {
    const { data } = await admin.from('classes').select('id')
    return (data ?? []).map((c: { id: string }) => c.id)
  }

  const classIds = new Set<string>()
  if (isTutor) {
    const { data } = await admin
      .from('class_tutors')
      .select('class_id')
      .eq('tutor_id', profile.id)
      .eq('active', true)
    for (const r of (data ?? []) as { class_id: string }[]) classIds.add(r.class_id)
  }
  if (isStudent) {
    const { data } = await admin
      .from('enrollments')
      .select('class_id')
      .eq('student_id', profile.id)
      .eq('active', true)
    for (const r of (data ?? []) as { class_id: string }[]) classIds.add(r.class_id)
  }
  return [...classIds]
}

/** Classes visible to the caller, with member counts, sorted by name. */
export async function listMyClasses(profile: Profile): Promise<ClassSummary[]> {
  const classIds = await myClassIds(profile)
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const [{ data: classes }, { data: tutors }, { data: students }] = await Promise.all([
    admin.from('classes').select('*').in('id', classIds).order('name'),
    admin.from('class_tutors').select('class_id').in('class_id', classIds).eq('active', true),
    admin.from('enrollments').select('class_id').in('class_id', classIds).eq('active', true),
  ])
  const tally = (rows: { class_id: string }[] | null): Map<string, number> => {
    const m = new Map<string, number>()
    ;(rows ?? []).forEach((r) => m.set(r.class_id, (m.get(r.class_id) ?? 0) + 1))
    return m
  }
  const tCount = tally(tutors as { class_id: string }[] | null)
  const sCount = tally(students as { class_id: string }[] | null)
  return ((classes ?? []) as ClassRow[]).map((c) => ({
    ...c,
    tutorCount: tCount.get(c.id) ?? 0,
    studentCount: sCount.get(c.id) ?? 0,
  }))
}

/** Tutors + students of a class, with display names resolved. */
export async function getClassMembers(classId: string): Promise<ClassMembers> {
  const admin = createAdminClient()
  const [{ data: ct }, { data: en }] = await Promise.all([
    admin.from('class_tutors').select('id, tutor_id').eq('class_id', classId).eq('active', true),
    admin.from('enrollments').select('id, student_id').eq('class_id', classId).eq('active', true),
  ])
  const tutorRows = (ct ?? []) as { id: string; tutor_id: string }[]
  const studentRows = (en ?? []) as { id: string; student_id: string }[]
  const allIds = [
    ...new Set([...tutorRows.map((r) => r.tutor_id), ...studentRows.map((r) => r.student_id)]),
  ]
  if (allIds.length === 0) return { tutors: [], students: [] }
  const pmap = await getProfilesByIds(allIds)
  const toMember = (profileId: string, rowId: string): ClassMember => {
    const p = pmap.get(profileId)
    return {
      id: profileId,
      rowId,
      name: p?.full_name ?? p?.email ?? profileId,
      email: p?.email ?? '',
      role: p?.role ?? 'student',
    }
  }
  return {
    tutors: tutorRows.map((r) => toMember(r.tutor_id, r.id)),
    students: studentRows.map((r) => toMember(r.student_id, r.id)),
  }
}

export type MentorContact = { name: string; email: string }

/**
 * Mentor contacts (name + email) keyed by student id. A mentor looks after a
 * student pastorally across all subjects (may or may not also be a tutor),
 * independent of who teaches their classes - see the `mentorships` table.
 */
export async function mentorsByStudent(studentIds: string[]): Promise<Map<string, MentorContact[]>> {
  const out = new Map<string, MentorContact[]>()
  if (studentIds.length === 0) return out
  const admin = createAdminClient()
  const { data: ms } = await admin
    .from('mentorships')
    .select('student_id, mentor_id')
    .in('student_id', studentIds)
    .eq('active', true)
  const rows = (ms ?? []) as { student_id: string; mentor_id: string }[]
  const mentorIds = [...new Set(rows.map((r) => r.mentor_id))]
  if (mentorIds.length === 0) return out
  const profiles = await getProfilesByIds(mentorIds)
  const byId = new Map(
    [...profiles].map(([id, p]) => [id, { name: p.full_name ?? p.email, email: p.email } as MentorContact]),
  )
  rows.forEach((r) => {
    const contact = byId.get(r.mentor_id)
    if (!contact) return
    const arr = out.get(r.student_id) ?? []
    arr.push(contact)
    out.set(r.student_id, arr)
  })
  return out
}

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfilesByIds } from './users'
import type { Profile } from '@/lib/auth/profile'

export type ClassRow = {
  id: string
  name: string
  status: 'active' | 'archived'
  created_at: string
}

export async function listClasses(): Promise<ClassRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('classes').select('*').order('name')
  if (error) throw new Error(`classes.list: ${error.message}`)
  return (data ?? []) as ClassRow[]
}

// Cached per-request: the class layout and its child page (Stream/Classwork/
// People) both resolve the same class, so this collapses to one read.
export const getClass = cache(async (id: string): Promise<ClassRow | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from('classes').select('*').eq('id', id).maybeSingle()
  return (data as ClassRow) ?? null
})

// Mutations run via the service role; callers gate with role / canManageClass first.
export async function createClass(name: string): Promise<ClassRow> {
  const admin = createAdminClient()
  // Explicit status (don't rely on the DB default) so mock mode also marks it active.
  const { data, error } = await admin.from('classes').insert({ name, status: 'active' }).select('*').single()
  if (error) throw new Error(`classes.create: ${error.message}`)
  return data as ClassRow
}

export async function setClassStatus(id: string, status: 'active' | 'archived'): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('classes').update({ status }).eq('id', id)
  if (error) throw new Error(`classes.setStatus: ${error.message}`)
}

export async function renameClass(id: string, name: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('classes').update({ name }).eq('id', id)
  if (error) throw new Error(`classes.rename: ${error.message}`)
}

/**
 * Class-centric aggregation layer (Google Classroom-style).
 *
 * A "class" is a `classes` row. Membership is derived from the existing
 * `class_teachers` and `enrollments` tables — there is no new core schema.
 * These helpers use the service-role client but ALWAYS scope by the caller's
 * own membership first, so they never widen what a user can see.
 */

export type ClassSummary = ClassRow & {
  teacherCount: number
  studentCount: number
}

export type ClassMember = { id: string; rowId: string; name: string; email: string; role: string }
export type ClassMembers = { teachers: ClassMember[]; students: ClassMember[] }

/** ClassRow ids the caller belongs to (admin sees all). */
async function myClassIds(profile: Profile): Promise<string[]> {
  const admin = createAdminClient()
  if (profile.role === 'admin') {
    const { data } = await admin.from('classes').select('id')
    return (data ?? []).map((c: { id: string }) => c.id)
  }
  if (profile.role === 'teacher') {
    const { data } = await admin
      .from('class_teachers')
      .select('class_id')
      .eq('teacher_id', profile.id)
      .eq('active', true)
    return [...new Set((data ?? []).map((r: { class_id: string }) => r.class_id))]
  }
  const { data } = await admin
    .from('enrollments')
    .select('class_id')
    .eq('student_id', profile.id)
    .eq('active', true)
  return [...new Set((data ?? []).map((r: { class_id: string }) => r.class_id))]
}

/** Classes visible to the caller, with member counts, sorted by name. */
export async function listMyClasses(profile: Profile): Promise<ClassSummary[]> {
  const classIds = await myClassIds(profile)
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const [{ data: classes }, { data: teachers }, { data: students }] = await Promise.all([
    admin.from('classes').select('*').in('id', classIds).order('name'),
    admin.from('class_teachers').select('class_id').in('class_id', classIds).eq('active', true),
    admin.from('enrollments').select('class_id').in('class_id', classIds).eq('active', true),
  ])
  const tally = (rows: { class_id: string }[] | null): Map<string, number> => {
    const m = new Map<string, number>()
    ;(rows ?? []).forEach((r) => m.set(r.class_id, (m.get(r.class_id) ?? 0) + 1))
    return m
  }
  const tCount = tally(teachers as { class_id: string }[] | null)
  const sCount = tally(students as { class_id: string }[] | null)
  return ((classes ?? []) as ClassRow[]).map((c) => ({
    ...c,
    teacherCount: tCount.get(c.id) ?? 0,
    studentCount: sCount.get(c.id) ?? 0,
  }))
}

/**
 * True if the caller may enter this class. Cached per-request: with `getProfile`
 * also cached, the layout and page pass the same profile ref + classId, so the
 * membership check runs once.
 */
export const canAccessClass = cache(async (profile: Profile, classId: string): Promise<boolean> => {
  if (profile.role === 'admin') return true
  const admin = createAdminClient()
  if (profile.role === 'teacher') {
    const { data } = await admin
      .from('class_teachers')
      .select('id')
      .eq('teacher_id', profile.id)
      .eq('class_id', classId)
      .eq('active', true)
      .maybeSingle()
    return !!data
  }
  const { data } = await admin
    .from('enrollments')
    .select('id')
    .eq('student_id', profile.id)
    .eq('class_id', classId)
    .eq('active', true)
    .maybeSingle()
  return !!data
})

/** Teachers + students of a class, with display names resolved. */
export async function getClassMembers(classId: string): Promise<ClassMembers> {
  const admin = createAdminClient()
  const [{ data: ct }, { data: en }] = await Promise.all([
    admin.from('class_teachers').select('id, teacher_id').eq('class_id', classId).eq('active', true),
    admin.from('enrollments').select('id, student_id').eq('class_id', classId).eq('active', true),
  ])
  const teacherRows = (ct ?? []) as { id: string; teacher_id: string }[]
  const studentRows = (en ?? []) as { id: string; student_id: string }[]
  const allIds = [
    ...new Set([...teacherRows.map((r) => r.teacher_id), ...studentRows.map((r) => r.student_id)]),
  ]
  if (allIds.length === 0) return { teachers: [], students: [] }
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
    teachers: teacherRows.map((r) => toMember(r.teacher_id, r.id)),
    students: studentRows.map((r) => toMember(r.student_id, r.id)),
  }
}

/** Can this user manage the class (roster + settings)? Admin, or a tutor of it. */
export async function canManageClass(profile: Profile, classId: string): Promise<boolean> {
  if (profile.role === 'admin') return true
  if (profile.role !== 'teacher') return false
  const admin = createAdminClient()
  const { data } = await admin
    .from('class_teachers')
    .select('id')
    .eq('teacher_id', profile.id)
    .eq('class_id', classId)
    .eq('active', true)
    .maybeSingle()
  return !!data
}

/** Class-scoped manage rule for content that can also be academy-wide: a class
 *  action needs canManageClass; a global (null class_id) action is admin-only. */
export async function canManageScope(profile: Profile, classId: string | null): Promise<boolean> {
  return classId === null ? profile.role === 'admin' : canManageClass(profile, classId)
}

export type MentorContact = { name: string; email: string }

/**
 * Mentor contacts (name + email) keyed by student id. A mentor is a teacher
 * assigned to look after a student pastorally (like a class teacher),
 * independent of which subjects they teach — see the `mentorships` table.
 */
export async function mentorsByStudent(studentIds: string[]): Promise<Map<string, MentorContact[]>> {
  const out = new Map<string, MentorContact[]>()
  if (studentIds.length === 0) return out
  const admin = createAdminClient()
  const { data: ms } = await admin
    .from('mentorships')
    .select('student_id, teacher_id')
    .in('student_id', studentIds)
    .eq('active', true)
  const rows = (ms ?? []) as { student_id: string; teacher_id: string }[]
  const teacherIds = [...new Set(rows.map((r) => r.teacher_id))]
  if (teacherIds.length === 0) return out
  const profiles = await getProfilesByIds(teacherIds)
  const byId = new Map(
    [...profiles].map(([id, p]) => [id, { name: p.full_name ?? p.email, email: p.email } as MentorContact]),
  )
  rows.forEach((r) => {
    const contact = byId.get(r.teacher_id)
    if (!contact) return
    const arr = out.get(r.student_id) ?? []
    arr.push(contact)
    out.set(r.student_id, arr)
  })
  return out
}

import type { Profile } from '@/lib/auth/profile'

export type ContactPersona = 'admin' | 'sub_admin' | 'mentor' | 'tutor' | 'student'

export type Contact = {
  id: string
  name: string
  personaKey: ContactPersona
  personaLabel: string
  relationLabel: string
  groupContextKeys: string[]
}

export type PersonaRow = { persona_name: string; scope_type: string | null; status: string }

export type EligibleRecipientInfo = {
  relationStudentIds: Set<string>
  relationClassIds: Set<string>
  viaDirect: boolean
  viaMatrix: boolean
}

export type ActorFlags = {
  isAdmin: boolean
  isSubAdmin: boolean
  isTutor: boolean
  hasMentorAuthority: boolean
  isStudent: boolean
}

export const CONTACT_PERSONA_ORDER: Record<ContactPersona, number> = {
  admin: 0,
  sub_admin: 1,
  mentor: 2,
  tutor: 3,
  student: 4,
}

export function resolveContactPersona(
  role: string | undefined,
  personas: ReadonlyArray<PersonaRow>,
): Pick<Contact, 'personaKey' | 'personaLabel'> {
  const hasGlobal = (name: string) =>
    personas.some(
      (persona) => persona.persona_name === name && persona.scope_type === 'global' && persona.status === 'active',
    )
  const hasMentor = personas.some((persona) => persona.persona_name === 'mentor' && persona.status === 'active')
  if (hasGlobal('admin')) return { personaKey: 'admin', personaLabel: 'Super Admin' }
  if (hasGlobal('sub_admin')) return { personaKey: 'sub_admin', personaLabel: 'Sub Admin' }
  if (hasGlobal('tutor')) {
    return hasMentor
      ? { personaKey: 'mentor', personaLabel: 'Tutor & Mentor' }
      : { personaKey: 'tutor', personaLabel: 'Tutor' }
  }
  if (hasMentor || role === 'mentor') return { personaKey: 'mentor', personaLabel: 'Mentor' }
  return { personaKey: 'student', personaLabel: 'Student' }
}

export function ensureRecipient(map: Map<string, EligibleRecipientInfo>, id: string): EligibleRecipientInfo {
  const current = map.get(id)
  if (current) return current

  const created: EligibleRecipientInfo = {
    relationStudentIds: new Set<string>(),
    relationClassIds: new Set<string>(),
    viaDirect: false,
    viaMatrix: false,
  }
  map.set(id, created)
  return created
}

export function addDirectRecipient(
  map: Map<string, EligibleRecipientInfo>,
  id: string,
  relation?: { studentIds?: Iterable<string>; classIds?: Iterable<string> },
) {
  const current = ensureRecipient(map, id)
  current.viaDirect = true
  for (const studentId of relation?.studentIds ?? []) current.relationStudentIds.add(studentId)
  for (const classId of relation?.classIds ?? []) current.relationClassIds.add(classId)
}

export function addMatrixRecipient(map: Map<string, EligibleRecipientInfo>, id: string) {
  ensureRecipient(map, id).viaMatrix = true
}

export function relationKeys(info: EligibleRecipientInfo): Set<string> {
  const keys = new Set<string>()
  for (const studentId of info.relationStudentIds) keys.add(`student:${studentId}`)
  for (const classId of info.relationClassIds) keys.add(`class:${classId}`)
  return keys
}

export function firstStudentName(
  info: EligibleRecipientInfo,
  names: Map<string, string>,
  fallback = 'this student',
): string {
  const first = [...info.relationStudentIds][0]
  return first ? (names.get(first) ?? fallback) : fallback
}

export function relationLabelForContact(
  actorFlags: ActorFlags,
  contact: Pick<Contact, 'personaKey' | 'personaLabel'>,
  profile: Pick<Profile, 'class_level'> | undefined,
  info: EligibleRecipientInfo,
  relatedStudentNames: Map<string, string>,
): string {
  if (contact.personaKey === 'student') {
    return profile?.class_level ?? ''
  }
  if (contact.personaKey === 'tutor') {
    if (actorFlags.isStudent) return 'Your class tutor'
    if (actorFlags.hasMentorAuthority) return `Tutor for ${firstStudentName(info, relatedStudentNames)}`
    return contact.personaLabel
  }
  if (contact.personaKey === 'mentor') {
    if (actorFlags.isStudent) return 'Your mentor'
    if (actorFlags.isTutor) return `Mentor for ${firstStudentName(info, relatedStudentNames)}`
    return contact.personaLabel
  }
  if (contact.personaKey === 'sub_admin') return 'Operations access'
  return 'Academy administration'
}

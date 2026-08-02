import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { selectActiveIdsAmong } from '@/lib/data/profiles'
import {
  selectActiveClassIdsForTutor,
  selectActiveClassIdsForStudent,
  selectActiveClassIdsForStudents,
  selectActiveStudentIdsByClassIds,
  selectActiveTutorIdsByClassIds,
} from '@/lib/data/class-membership'
import { selectActivePersonaAssignmentsByProfileIds, selectActiveProfileIdsByPersona } from '@/lib/data/personas'
import { selectActiveMentorIdsForStudent, selectActiveMentorshipsForStudents } from '@/lib/data/mentorships'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { MESSAGING_PERSONAS, matrixAllows, parseMessagingMatrix, personasFromFlags } from '@/lib/messaging/matrix'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { studentIdsOfMentor } from '@/lib/services/mentorships'
import { getProfilesByIds } from '@/lib/services/users'
import {
  addDirectRecipient,
  addMatrixRecipient,
  relationKeys,
  relationLabelForContact,
  resolveContactPersona,
  CONTACT_PERSONA_ORDER,
  type Contact,
  type EligibleRecipientInfo,
} from './recipient-policy-shared'

export async function resolveEligibleRecipients(actor: Profile): Promise<{
  actorFlags: Awaited<ReturnType<typeof loadPersonaFlags>>
  recipients: Map<string, EligibleRecipientInfo>
}> {
  const actorFlags = await loadPersonaFlags(actor.id)
  const recipients = new Map<string, EligibleRecipientInfo>()

  if (actorFlags.isStudent) {
    const classIds = [...new Set(await selectActiveClassIdsForStudent(actor.id))]
    if (classIds.length) {
      const tutorIds = await selectActiveTutorIdsByClassIds(classIds)
      for (const tutorId of tutorIds) {
        addDirectRecipient(recipients, tutorId, { studentIds: [actor.id], classIds })
      }
    }

    const mentorIds = await selectActiveMentorIdsForStudent(actor.id)
    if (mentorIds.length) {
      for (const mentorId of await selectActiveIdsAmong(mentorIds)) {
        addDirectRecipient(recipients, mentorId, { studentIds: [actor.id] })
      }
    }
  }

  if (actorFlags.isTutor) {
    const taughtClassIds = [...new Set(await selectActiveClassIdsForTutor(actor.id))]
    const studentIds = taughtClassIds.length ? await selectActiveStudentIdsByClassIds(taughtClassIds) : []
    const sharedClassIdsByStudent = new Map<string, string[]>()
    for (const studentId of studentIds) {
      const sharedClassIds = (await selectActiveClassIdsForStudent(studentId)).filter((classId) =>
        taughtClassIds.includes(classId),
      )
      sharedClassIdsByStudent.set(studentId, sharedClassIds)
      addDirectRecipient(recipients, studentId, { studentIds: [studentId], classIds: sharedClassIds })
    }

    if (studentIds.length) {
      const mentorships = await selectActiveMentorshipsForStudents(studentIds)
      const activeMentorIds = new Set(await selectActiveIdsAmong(mentorships.map((row) => row.mentor_id)))
      const studentIdsByMentor = new Map<string, Set<string>>()
      for (const link of mentorships) {
        if (!activeMentorIds.has(link.mentor_id)) continue
        const current = studentIdsByMentor.get(link.mentor_id)
        if (current) current.add(link.student_id)
        else studentIdsByMentor.set(link.mentor_id, new Set([link.student_id]))
      }
      for (const [mentorId, sharedStudentIds] of studentIdsByMentor) {
        const mentorClassIds = new Set<string>()
        for (const studentId of sharedStudentIds) {
          for (const classId of sharedClassIdsByStudent.get(studentId) ?? []) mentorClassIds.add(classId)
        }
        addDirectRecipient(recipients, mentorId, { studentIds: sharedStudentIds, classIds: mentorClassIds })
      }
    }
  }

  if (actorFlags.hasMentorAuthority) {
    const menteeIds = await studentIdsOfMentor(actor.id)
    const studentClassIds = new Map<string, string[]>()
    for (const studentId of menteeIds) {
      const classIds = await selectActiveClassIdsForStudent(studentId)
      studentClassIds.set(studentId, classIds)
      addDirectRecipient(recipients, studentId, { studentIds: [studentId], classIds })
    }

    if (menteeIds.length) {
      const classIds = [...new Set(await selectActiveClassIdsForStudents(menteeIds))]
      const tutorIds = classIds.length ? await selectActiveTutorIdsByClassIds(classIds) : []
      const sharedStudentsByTutor = new Map<string, Set<string>>()
      const sharedClassesByTutor = new Map<string, Set<string>>()
      for (const tutorId of tutorIds) {
        const taughtClassIds = new Set(await selectActiveClassIdsForTutor(tutorId))
        for (const studentId of menteeIds) {
          const sharedClassIds = (studentClassIds.get(studentId) ?? []).filter((classId) => taughtClassIds.has(classId))
          if (sharedClassIds.length === 0) continue
          const currentStudents = sharedStudentsByTutor.get(tutorId)
          if (currentStudents) currentStudents.add(studentId)
          else sharedStudentsByTutor.set(tutorId, new Set([studentId]))
          const currentClasses = sharedClassesByTutor.get(tutorId)
          if (currentClasses) sharedClassIds.forEach((classId) => currentClasses.add(classId))
          else sharedClassesByTutor.set(tutorId, new Set(sharedClassIds))
        }
      }
      for (const tutorId of tutorIds) {
        const sharedStudentIds = sharedStudentsByTutor.get(tutorId) ?? new Set<string>()
        const sharedClassIds = sharedClassesByTutor.get(tutorId) ?? new Set<string>()
        addDirectRecipient(recipients, tutorId, { studentIds: sharedStudentIds, classIds: sharedClassIds })
      }
    }
  }

  const matrix = parseMessagingMatrix((await getOrgSettings()).messaging_matrix)
  if (matrix.size) {
    const targets = new Set<string>()
    for (const persona of personasFromFlags(actorFlags)) {
      for (const targetPersona of MESSAGING_PERSONAS) {
        if (matrixAllows(matrix, persona, targetPersona)) targets.add(targetPersona)
      }
    }
    for (const persona of targets) {
      for (const id of await selectActiveProfileIdsByPersona(persona)) addMatrixRecipient(recipients, id)
    }
  }

  recipients.delete(actor.id)
  return { actorFlags, recipients }
}

export async function listResolvedContacts(actor: Profile): Promise<Contact[]> {
  const { actorFlags, recipients } = await resolveEligibleRecipients(actor)
  const recipientIds = [...recipients.keys()]
  if (recipientIds.length === 0) return []

  const [profiles, personaRows, relatedStudentProfiles] = await Promise.all([
    getProfilesByIds(recipientIds),
    selectActivePersonaAssignmentsByProfileIds(recipientIds),
    getProfilesByIds([...new Set([...recipients.values()].flatMap((info) => [...info.relationStudentIds]))]),
  ])
  const personasByProfile = new Map<string, typeof personaRows>()
  for (const row of personaRows) {
    const current = personasByProfile.get(row.profile_id)
    if (current) current.push(row)
    else personasByProfile.set(row.profile_id, [row])
  }
  const relatedStudentNames = new Map(
    [...relatedStudentProfiles].map(([id, profile]) => [id, profile.full_name ?? profile.email]),
  )

  return recipientIds
    .map((id) => {
      const profile = profiles.get(id)
      const personas = personasByProfile.get(id) ?? []
      const identity = resolveContactPersona(profile?.role, personas)
      return {
        id,
        name: profile?.full_name ?? profile?.email ?? id,
        relationLabel: relationLabelForContact(
          actorFlags,
          identity,
          profile ? { class_level: profile.class_level ?? null } : undefined,
          recipients.get(id)!,
          relatedStudentNames,
        ),
        groupContextKeys: [...relationKeys(recipients.get(id)!)].sort(),
        ...identity,
      }
    })
    .sort((a, b) => {
      const personaDiff = CONTACT_PERSONA_ORDER[a.personaKey] - CONTACT_PERSONA_ORDER[b.personaKey]
      return personaDiff || a.name.localeCompare(b.name)
    })
}

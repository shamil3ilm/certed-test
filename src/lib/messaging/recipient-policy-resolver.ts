import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { selectActiveIdsAmong } from '@/lib/data/profiles'
import {
  selectActiveClassIdsForTutor,
  selectActiveClassIdsForStudent,
  selectActiveTutorIdsByClassIds,
  selectActiveEnrollmentPairsByClassIds,
  selectActiveEnrollmentPairsByStudentIds,
  selectActiveTutorPairsByClassIds,
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
    // One query for every (student, class) edge in the tutor's classes, grouped in
    // memory. Each pair's class is already a taught class (the query is scoped to
    // taughtClassIds), so no further filtering.
    const enrollmentPairs = taughtClassIds.length ? await selectActiveEnrollmentPairsByClassIds(taughtClassIds) : []
    const sharedClassIdsByStudent = new Map<string, string[]>()
    for (const { student_id, class_id } of enrollmentPairs) {
      const classIds = sharedClassIdsByStudent.get(student_id)
      if (classIds) {
        if (!classIds.includes(class_id)) classIds.push(class_id)
      } else {
        sharedClassIdsByStudent.set(student_id, [class_id])
      }
    }
    const studentIds = [...sharedClassIdsByStudent.keys()]
    for (const [studentId, sharedClassIds] of sharedClassIdsByStudent) {
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
    // One query for all mentees' enrolments, grouped per mentee. Mentees with no
    // enrolment still get added as recipients below.
    const menteeEnrollmentPairs = menteeIds.length ? await selectActiveEnrollmentPairsByStudentIds(menteeIds) : []
    const studentClassIds = new Map<string, string[]>()
    for (const { student_id, class_id } of menteeEnrollmentPairs) {
      const classIds = studentClassIds.get(student_id)
      if (classIds) {
        if (!classIds.includes(class_id)) classIds.push(class_id)
      } else {
        studentClassIds.set(student_id, [class_id])
      }
    }
    for (const studentId of menteeIds) {
      addDirectRecipient(recipients, studentId, {
        studentIds: [studentId],
        classIds: studentClassIds.get(studentId) ?? [],
      })
    }

    if (menteeIds.length) {
      // Distinct classes the mentees are in (union of the per-mentee lists above).
      const classIds = [...new Set(menteeEnrollmentPairs.map((pair) => pair.class_id))]
      // One query for every (tutor, class) edge across those classes, grouped per
      // tutor. Each tutor's set is that tutor's taught classes already intersected
      // with the mentees' classes, which is exactly what the inner loop needs (a
      // mentee's classes are a subset of these).
      const tutorPairs = classIds.length ? await selectActiveTutorPairsByClassIds(classIds) : []
      const menteeClassesByTutor = new Map<string, Set<string>>()
      for (const { tutor_id, class_id } of tutorPairs) {
        const classes = menteeClassesByTutor.get(tutor_id)
        if (classes) classes.add(class_id)
        else menteeClassesByTutor.set(tutor_id, new Set([class_id]))
      }
      const tutorIds = [...menteeClassesByTutor.keys()]
      const sharedStudentsByTutor = new Map<string, Set<string>>()
      const sharedClassesByTutor = new Map<string, Set<string>>()
      for (const tutorId of tutorIds) {
        const taughtClassIds = menteeClassesByTutor.get(tutorId) ?? new Set<string>()
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
    // Resolve every allowed target persona's members in parallel (bounded by the
    // number of personas, <=5) rather than one sequential query per persona.
    const personaIdLists = await Promise.all([...targets].map((persona) => selectActiveProfileIdsByPersona(persona)))
    for (const ids of personaIdLists) {
      for (const id of ids) addMatrixRecipient(recipients, id)
    }
  }

  recipients.delete(actor.id)

  // Every recipient must be a currently-active account. The branches above use
  // `selectActive*` membership queries, but those filter the EDGE (enrolment,
  // teaching link, persona), not the target profile's status - so a revoked
  // tutor/mentee/tutor-of-mentee would otherwise surface through four of the six
  // branches. Re-filter the whole set against live profile status once, so a single
  // guarantee covers every branch instead of each having to remember to.
  if (recipients.size) {
    const activeIds = new Set(await selectActiveIdsAmong([...recipients.keys()]))
    for (const id of [...recipients.keys()]) {
      if (!activeIds.has(id)) recipients.delete(id)
    }
  }

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

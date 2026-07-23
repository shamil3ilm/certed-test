/**
 * Mentorships domain, split by concern:
 *   validation.ts  raw form values -> trusted inputs (pure)
 *   queries.ts     reads
 *   commands.ts    assign / remove, gated on manageMentorships
 *
 * Table access lives in src/lib/data/mentorships, and the scoped-persona writes
 * in src/lib/data/personas - a mentorship is a link row PLUS the student-scoped
 * mentor persona that actually grants access.
 */
export { validateAssignMentorInput, validateRemoveMentorInput } from './validation'
export type { MentorshipParams, AssignMentorActionInput, RemoveMentorActionInput } from './validation'

export { listMentorships, listMentorshipsForUsersHub, studentIdsOfMentor } from './queries'
export type { Mentorship } from './queries'

export {
  assertAssignableMentor,
  assignMentor,
  assignMentorFromActionInput,
  removeMentor,
  removeMentorFromActionInput,
} from './commands'

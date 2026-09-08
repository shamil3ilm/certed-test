/**
 * Classes domain, split by concern:
 *   validation.ts  raw form values -> trusted inputs (pure)
 *   queries.ts     reads, plus the class-membership aggregation
 *   lifecycle.ts   admin-only create / rename / archive / restore
 *
 * Table access lives in src/lib/data/classes and src/lib/data/class-membership.
 */
export { validateRenameClassInput, validateClassIdInput } from './validation'
export type { RenameClassActionInput, ClassIdActionInput } from './validation'

export {
  listClasses,
  listClassesByIds,
  countActiveClasses,
  getClass,
  myClassIds,
  myClassScope,
  listMyClasses,
  getClassMembers,
  mentorsByStudent,
} from './queries'
export type { ClassRow, ClassSummary, ClassMember, ClassMembers, MemberBrief, MentorContact } from './queries'

export { sortClassesByStudent, groupClassesByStudent } from './grouping'
export type { ClassStudentGroup } from './grouping'

export {
  createClass,
  renameClass,
  renameClassFromActionInput,
  archiveClass,
  archiveClassFromActionInput,
  restoreClass,
  restoreClassFromActionInput,
} from './lifecycle'

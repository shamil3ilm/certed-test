/**
 * Classes domain, split by concern:
 *   validation.ts  raw form values -> trusted inputs (pure)
 *   queries.ts     reads, plus the class-membership aggregation
 *   lifecycle.ts   admin-only create / rename / archive / restore
 *
 * Table access lives in src/lib/data/classes and src/lib/data/class-membership.
 */
export { validateCreateClassInput, validateRenameClassInput, validateClassIdInput } from './validation'
export type { CreateClassActionInput, RenameClassActionInput, ClassIdActionInput } from './validation'

export {
  listClasses,
  listClassesByIds,
  countActiveClasses,
  getClass,
  myClassIds,
  listMyClasses,
  getClassMembers,
  mentorsByStudent,
} from './queries'
export type { ClassRow, ClassSummary, ClassMember, ClassMembers, MemberBrief, MentorContact } from './queries'

export { sortClassesByStudent, groupClassesByStudent } from './grouping'
export type { ClassStudentGroup } from './grouping'

export {
  createClass,
  createClassFromActionInput,
  renameClass,
  renameClassFromActionInput,
  archiveClass,
  archiveClassFromActionInput,
  restoreClass,
  restoreClassFromActionInput,
} from './lifecycle'

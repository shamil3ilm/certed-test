/**
 * User domain. Split by concern so no single file is the only place to understand
 * the account lifecycle:
 *
 *  - directory.ts        reads: lists, pages, counts, lookups
 *  - registration.ts     unauthenticated bootstrap (setup code -> login)
 *  - self-service.ts     what a signed-in user changes about their own account
 *  - admin-lifecycle.ts  add / revoke / restore / edit + the tier rules
 *  - validation.ts       action-boundary parsing for the management forms
 *  - activation-notice.ts tells the people who manage accounts that an invite went live
 */
export {
  listProfilesByFilter,
  listProfilesByRole,
  countPeople,
  countUsersHubStats,
  displayName,
  getProfilesByIds,
  getProfileNamesByIds,
  getProfileLabelsByIds,
  getProfileById,
  listActiveByRole,
  listActiveMentorCandidates,
  listActiveTeacherCandidates,
  searchProfileIds,
  getProfileByEmail,
} from './directory'
export type { PaginatedProfiles, PeopleCounts, UsersHubStats, ProfileLite } from './directory'

export { completePasswordRegistration } from './registration'
export type { RegistrationTarget, RegisterResult } from './registration'

export { notifyAccountActivated } from './activation-notice'

export { updateOwnProfile, updateOwnProfileDetails, changeOwnPassword, changeOwnEmail } from './self-service'

export {
  addUser,
  addUserFromActionInput,
  deleteUnregisteredProfile,
  revokeUser,
  revokeUserFromActionInput,
  restoreUser,
  restoreUserFromActionInput,
  eraseUser,
  eraseUserFromActionInput,
  editUser,
  editUserFromActionInput,
} from './admin-lifecycle'
export type { AddUserResult } from './admin-lifecycle'

export { validateAddUserInput, validateEditUserInput, validateUserIdInput } from './validation'
export type { AddUserActionInput, EditUserActionInput, UserIdActionInput } from './validation'

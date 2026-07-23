/**
 * User domain. Split by concern so no single file is the only place to understand
 * the account lifecycle:
 *
 *  - directory.ts        reads: lists, pages, counts, lookups
 *  - registration.ts     unauthenticated bootstrap (setup code -> login)
 *  - self-service.ts     what a signed-in user changes about their own account
 *  - admin-lifecycle.ts  add / revoke / restore / edit + the tier rules
 *  - validation.ts       action-boundary parsing for the management forms
 *  - personas.ts         keeping the global persona in step with the role
 */
export {
  listProfiles,
  listProfilesByRole,
  countPeople,
  countUsersHubStats,
  displayName,
  getProfilesByIds,
  getProfileNamesByIds,
  getProfileById,
  listActiveByRole,
  listActiveMentorCandidates,
  getProfileByEmail,
} from './directory'
export type { PaginatedProfiles, PeopleCounts, UsersHubStats, ProfileLite } from './directory'

export { getRegistrationTarget, bindPasswordAccount, completePasswordRegistration } from './registration'
export type { RegistrationTarget, RegisterResult } from './registration'

export { updateOwnProfile, changeOwnPassword } from './self-service'

export {
  addUser,
  addUserFromActionInput,
  deleteUnregisteredProfile,
  revokeUser,
  revokeUserFromActionInput,
  restoreUser,
  restoreUserFromActionInput,
  editUser,
  editUserFromActionInput,
} from './admin-lifecycle'
export type { AddUserResult } from './admin-lifecycle'

export { validateAddUserInput, validateEditUserInput, validateUserIdInput } from './validation'
export type { AddUserActionInput, EditUserActionInput, UserIdActionInput } from './validation'

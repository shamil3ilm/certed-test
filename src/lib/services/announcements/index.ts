/**
 * Announcements domain, split by concern:
 *   validation.ts  raw form values -> trusted inputs (pure)
 *   queries.ts     reads, and the class + academy-wide merge they all need
 *   commands.ts    post / edit / archive / restore, gated on canManageScope
 *
 * Table access lives in src/lib/data/announcements.
 */
export { validateCreateAnnouncementInput, validateEditAnnouncementInput } from './validation'
export type {
  CreateAnnouncementInput,
  CreateAnnouncementActionInput,
  EditAnnouncementActionInput,
} from './validation'

export { getLatestAnnouncementForClasses, listAnnouncementsForClassPage, getAnnouncement } from './queries'
export type { Announcement, PaginatedAnnouncements } from './queries'

export {
  createAnnouncement,
  createAnnouncementFromActionInput,
  archiveAnnouncement,
  restoreAnnouncement,
  editAnnouncement,
  editAnnouncementFromActionInput,
} from './commands'

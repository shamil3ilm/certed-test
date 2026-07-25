import 'server-only'
import {
  selectAnnouncementById,
  selectClassPageSources,
  selectNewestForClasses,
  type AnnouncementRow,
} from '@/lib/data/announcements'

/**
 * Reading announcements.
 *
 * Every read draws from two sources - the class's own posts and academy-wide
 * ones - which the data layer returns separately. Merging them by date is this
 * module's job.
 */

export type Announcement = AnnouncementRow
export type PaginatedAnnouncements = { items: Announcement[]; total: number }

/** Newest first, ties left in encounter order. */
const byNewest = (a: Announcement, b: Announcement): number =>
  a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0

/**
 * The single newest announcement across a set of classes (plus academy-wide
 * posts) - the dashboard's "latest announcement" widget.
 */
export async function getLatestAnnouncementForClasses(classIds: string[]): Promise<Announcement | null> {
  const { classRows, globalRows } = await selectNewestForClasses(classIds)
  const candidates = [...classRows, ...globalRows].filter((a) => a.status === 'active').sort(byNewest)
  return candidates[0] ?? null
}

/**
 * Real page-through for the class Stream - a flat top-100 cap would mean
 * anything older just silently stops being reachable.
 *
 * The two sources interleave by date, so neither query can be limited to a
 * single page on its own: each offers everything up to the end of the requested
 * page, and the correct slice is taken after the merge. Totals are exact counts
 * from the data layer, not a count of what was fetched.
 */
export async function listAnnouncementsForClassPage(
  classId: string,
  opts: { page: number; pageSize: number; status?: 'active' | 'archived'; search?: string },
): Promise<PaginatedAnnouncements> {
  const { classRows, globalRows, classCount, globalCount } = await selectClassPageSources(classId, {
    limit: opts.page * opts.pageSize,
    status: opts.status ?? 'active',
    search: opts.search,
  })
  const merged = [...classRows, ...globalRows].sort(byNewest)
  const from = (opts.page - 1) * opts.pageSize
  return { items: merged.slice(from, from + opts.pageSize), total: classCount + globalCount }
}

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  return selectAnnouncementById(id)
}

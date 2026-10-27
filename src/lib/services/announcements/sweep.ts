import 'server-only'
import { claimAnnouncementsGoingLive } from '@/lib/data/announcements-sweep'
import { selectLiveClassIds } from '@/lib/data/assignments-due-sweep'
import { notifyClassOfPost } from './commands'

export type GoLiveResult = { claimed: number; announced: number }

/**
 * Tell each class about the announcements whose publish time has arrived.
 *
 * Posting a scheduled announcement notifies nobody - it is not live yet - so without this the class
 * finds it by happening to open the stream. This is the other end of that date.
 *
 * `claimed` counts posts taken, `announced` those a class was actually told about. They differ for a
 * post that expired before the sweep reached it, or whose class has been archived since: both are
 * stamped (so they are not looked at again) and neither is news.
 */
export async function announceScheduledAnnouncements(): Promise<GoLiveResult> {
  const now = Date.now()
  const claimed = await claimAnnouncementsGoingLive(new Date(now).toISOString())
  if (claimed.length === 0) return { claimed: 0, announced: 0 }

  const liveClasses = await selectLiveClassIds([...new Set(claimed.map((a) => a.class_id))])
  let announced = 0
  for (const post of claimed) {
    if (post.expires_at && Date.parse(post.expires_at) <= now) continue
    if (!liveClasses.has(post.class_id)) continue
    // The same notice posting it live would have sent, to the same people, minus its author.
    await notifyClassOfPost(post, post.author_id ?? '', 'New announcement')
    announced += 1
  }
  return { claimed: claimed.length, announced }
}

import 'server-only'
import { getDriveStorage } from '@/lib/google/drive-storage'
import { markAttachmentsFailed, selectLiveAttachmentIds, selectStalePendingAttachmentIds } from '@/lib/data/attachments'
import { deployEnv } from './upload'

/**
 * Reconciliation closes the gap the two-phase commit (Postgres, then Drive) can
 * leave when a request dies between the phases. It runs on a schedule (see the cron
 * route), never on a user request, and works in both directions:
 *
 *   A. A row stuck `pending` past the hour -> `failed`. Its upload never reached
 *      phase 2; the row is not servable and must not linger as pending.
 *   B. A Drive file whose row is gone or terminal -> deleted, reclaiming storage.
 *      A file for a still-LIVE row (active, or pending within the hour so its
 *      upload may still be in flight) is kept.
 *
 * The two directions compose: A demotes the hour-old stuck rows to failed, so B
 * then reclaims their files in the same run.
 */

const STALE_PENDING_MS = 60 * 60 * 1000 // 1 hour

export type ReconcileResult = {
  stalePendingFailed: number
  orphanFilesDeleted: number
  orphanFilesFailed: number
}

export async function reconcileAttachments(now: Date = new Date()): Promise<ReconcileResult> {
  // A. Demote stuck pending rows.
  const cutoff = new Date(now.getTime() - STALE_PENDING_MS).toISOString()
  const staleIds = await selectStalePendingAttachmentIds(cutoff)
  await markAttachmentsFailed(staleIds)

  // B. Reclaim orphaned Drive files for THIS environment.
  const drive = getDriveStorage()
  const driveFiles = await drive.listFilesByAppProperty('env', deployEnv())
  const candidateIds = driveFiles.map((file) => file.appProperties.attachmentId).filter(Boolean)
  const liveIds = await selectLiveAttachmentIds(candidateIds)

  let orphanFilesDeleted = 0
  let orphanFilesFailed = 0
  for (const file of driveFiles) {
    const attachmentId = file.appProperties.attachmentId
    // Conservative: only delete a file we can positively tie to a dead/absent row.
    // A file without our attachmentId stamp is left alone; a live row keeps its file.
    if (!attachmentId || liveIds.has(attachmentId)) continue
    try {
      await drive.deleteFile(file.id)
      orphanFilesDeleted++
    } catch {
      // Best-effort: leave it for the next run rather than failing the whole sweep.
      orphanFilesFailed++
    }
  }

  return { stalePendingFailed: staleIds.length, orphanFilesDeleted, orphanFilesFailed }
}

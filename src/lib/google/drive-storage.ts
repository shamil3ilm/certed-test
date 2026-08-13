import 'server-only'
import { isMock } from '@/lib/mock/env'
import { driveStorageConfigured } from '@/lib/env'
import { mockDriveStorage } from './drive-storage-mock'
import { googleDriveStorage } from './drive-storage-google'

/**
 * The server's view of the academy-owned Google Drive. All custodial file bytes
 * pass through this interface, so nothing above it knows or cares HOW the Drive is
 * reached - a dedicated account's refresh token today, a service account + Shared
 * Drive later - and MOCK_MODE swaps in an in-memory provider so the E2E build stays
 * self-contained. No Google credential ever leaves the server.
 */

export type DriveUploadParams = {
  /** Drive filename: `{attachmentId}__{sanitized_original_name}`. */
  name: string
  mimeType: string
  /** The dated leaf folder the file is written into (from ensureFolderPath). */
  folderId: string
  bytes: Uint8Array
  /**
   * Stamped onto the Drive file, `{ attachmentId, env }`. This is the load-bearing
   * detail for orphan reconciliation in both directions - a stuck row to its file,
   * a stray file to the absence of a row - and keeps a staging upload from ever
   * being mistaken for a production one.
   */
  appProperties: Record<string, string>
}

export type DriveFileStream = {
  body: ReadableStream<Uint8Array>
  mimeType: string | null
  size: number | null
}

/** A Drive file as reconciliation sees it: just its id and the appProperties that
 *  tie it back to an attachment row (or reveal it as a stray). */
export type DriveFileRef = { id: string; appProperties: Record<string, string> }

export interface DriveStorage {
  /**
   * Find-or-create the nested folder path under the configured root, returning the
   * leaf folder id. Idempotent, so concurrent uploads into the same month converge
   * on one folder rather than racing to create duplicates.
   */
  ensureFolderPath(segments: string[]): Promise<string>
  /** Upload bytes into `folderId`, stamped with appProperties. Returns the Drive file id. */
  createFile(params: DriveUploadParams): Promise<{ id: string }>
  /** Stream a file's bytes for an access-checked download/preview. */
  getFileStream(fileId: string): Promise<DriveFileStream>
  /** Delete a file - used by reconciliation to clear failed/orphaned uploads. */
  deleteFile(fileId: string): Promise<void>
  /**
   * Every file stamped with `appProperties[key] === value` (e.g. env === the
   * deployment), so reconciliation can match Drive's contents against the rows and
   * find files whose row is gone or terminal. Returns id + appProperties only.
   */
  listFilesByAppProperty(key: string, value: string): Promise<DriveFileRef[]>
}

/**
 * The active provider: an in-memory fake in mock mode, the real Drive-backed
 * adapter otherwise. Mirrors createAdminClient()'s mock/real split so callers stay
 * environment-agnostic.
 */
export function getDriveStorage(): DriveStorage {
  return isMock() ? mockDriveStorage : googleDriveStorage()
}

/**
 * Whether an upload can actually succeed: the in-memory provider is always ready in
 * mock mode, otherwise the four GOOGLE_DRIVE_* credentials must be set. A route can
 * check this up front and return a clean "storage isn't configured yet" instead of
 * letting the upload fail deep in the Drive token exchange with a 500.
 */
export function driveStorageAvailable(): boolean {
  return isMock() || driveStorageConfigured()
}

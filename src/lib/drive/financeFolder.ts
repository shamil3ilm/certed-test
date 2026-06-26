import 'server-only'
import { getDriveClient } from './auth'
import { ensureFolderPath } from './folders'
import { isMock } from '@/lib/mock/env'

const ROOT_NAME = 'Cert-Ed Academia'

/**
 * Resolves `Cert-Ed Academia / Finance / <sub>`. These folders aren't course-
 * scoped, so we don't cache them in `drive_folders` (NULL course_id wouldn't
 * dedupe); `ensureFolderPath` is idempotent and reuses existing folders.
 */
export async function resolveFinanceFolder(sub: 'Receipts' | 'Pay Slips'): Promise<string> {
  if (isMock()) return `mock-finance-${sub.replace(/\s+/g, '-').toLowerCase()}`
  const drive = await getDriveClient()
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || 'root'
  return ensureFolderPath(drive, rootId, [ROOT_NAME, 'Finance', sub])
}

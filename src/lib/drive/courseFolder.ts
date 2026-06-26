import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDriveClient } from './auth'
import { ensureFolderPath } from './folders'
import { isMock } from '@/lib/mock/env'

const ROOT_NAME = 'Cert-Ed Academia'

/**
 * Resolves (and caches in `drive_folders`) a course-scoped Drive folder id.
 * Uses the service-role client for the cache so it works regardless of the
 * caller's role.
 */
async function resolveCachedFolder(
  courseId: string,
  kind: string,
  segments: string[],
): Promise<string> {
  if (isMock()) return `mock-folder-${kind}`
  const admin = createAdminClient()
  const { data: cached } = await admin
    .from('drive_folders')
    .select('drive_folder_id')
    .eq('course_id', courseId)
    .eq('kind', kind)
    .maybeSingle()
  if (cached?.drive_folder_id) return cached.drive_folder_id as string

  const drive = await getDriveClient()
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || 'root'
  const folderId = await ensureFolderPath(drive, rootId, segments)
  await admin
    .from('drive_folders')
    .upsert({ course_id: courseId, kind, drive_folder_id: folderId }, { onConflict: 'course_id,kind' })
  return folderId
}

/** `Cert-Ed Academia / <course> / Resources` */
export function resolveResourcesFolder(courseId: string, courseName: string): Promise<string> {
  return resolveCachedFolder(courseId, 'resources', [ROOT_NAME, courseName, 'Resources'])
}

/** `Cert-Ed Academia / Student Submissions / <course>` */
export function resolveSubmissionsFolder(courseId: string, courseName: string): Promise<string> {
  return resolveCachedFolder(courseId, 'submissions', [ROOT_NAME, 'Student Submissions', courseName])
}

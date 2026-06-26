import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDriveClient } from './auth'
import { ensureFolderPath } from './folders'

const ROOT_NAME = 'Cert-Ed Academia'

/**
 * Resolves (and caches in `drive_folders`) the Drive folder id for a course's
 * Resources folder: `Cert-Ed Academia / <course> / Resources`. Uses the
 * service-role client for the cache so it works regardless of the caller's role.
 */
export async function resolveResourcesFolder(courseId: string, courseName: string): Promise<string> {
  const admin = createAdminClient()
  const { data: cached } = await admin
    .from('drive_folders')
    .select('drive_folder_id')
    .eq('course_id', courseId)
    .eq('kind', 'resources')
    .maybeSingle()
  if (cached?.drive_folder_id) return cached.drive_folder_id as string

  const drive = await getDriveClient()
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || 'root'
  const folderId = await ensureFolderPath(drive, rootId, [ROOT_NAME, courseName, 'Resources'])
  await admin
    .from('drive_folders')
    .upsert(
      { course_id: courseId, kind: 'resources', drive_folder_id: folderId },
      { onConflict: 'course_id,kind' },
    )
  return folderId
}

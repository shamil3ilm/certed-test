const FOLDER_MIME = 'application/vnd.google-apps.folder'

/** Returns the id of the named child folder under `parentId`, creating it if absent. */
export async function ensureChildFolder(
  drive: any,
  parentId: string,
  name: string,
): Promise<string> {
  const safe = name.replace(/'/g, "\\'")
  const { data } = await drive.files.list({
    q: `name = '${safe}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id,name)',
    spaces: 'drive',
  })
  if (data.files?.[0]?.id) return data.files[0].id
  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
  })
  return created.data.id
}

/** Walks/creates a folder path under `rootId`; callers cache the leaf id in `drive_folders`. */
export async function ensureFolderPath(
  drive: any,
  rootId: string,
  segments: string[],
): Promise<string> {
  let parent = rootId
  for (const seg of segments) parent = await ensureChildFolder(drive, parent, seg)
  return parent
}

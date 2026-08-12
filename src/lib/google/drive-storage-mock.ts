import 'server-only'
import { randomUUID } from 'node:crypto'
import type { DriveFileRef, DriveStorage } from './drive-storage'

/**
 * In-memory DriveStorage for MOCK_MODE and unit/E2E runs. The mock server is a
 * single long-running process, so a file uploaded in one request is readable by a
 * download in the next. Nothing is persisted - this exists so the app can be
 * clicked through and tested without a real Google account, never in production.
 */

type MockFile = {
  name: string
  mimeType: string
  folderId: string
  bytes: Uint8Array
  appProperties: Record<string, string>
}

const files = new Map<string, MockFile>()
const folderIds = new Map<string, string>()

export const mockDriveStorage: DriveStorage = {
  async ensureFolderPath(segments) {
    const path = segments.join('/')
    let id = folderIds.get(path)
    if (!id) {
      id = `mock-folder:${path}`
      folderIds.set(path, id)
    }
    return id
  },

  async createFile({ name, mimeType, folderId, bytes, appProperties }) {
    const id = `mock-file:${randomUUID()}`
    files.set(id, { name, mimeType, folderId, bytes: Uint8Array.from(bytes), appProperties })
    return { id }
  },

  async getFileStream(fileId) {
    const file = files.get(fileId)
    if (!file) throw new Error(`mock drive: no file ${fileId}`)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(file.bytes)
        controller.close()
      },
    })
    return { body, mimeType: file.mimeType, size: file.bytes.byteLength }
  },

  async deleteFile(fileId) {
    files.delete(fileId)
  },

  async listFilesByAppProperty(key, value) {
    const out: DriveFileRef[] = []
    for (const [id, file] of files) {
      if (file.appProperties[key] === value) out.push({ id, appProperties: file.appProperties })
    }
    return out
  },
}

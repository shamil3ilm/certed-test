'use client'
import { useState } from 'react'

type UploadParams = { courseId: string; title: string; file: File }
type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

/**
 * Three-phase resumable upload: init (server opens a Drive session) → PUT the
 * bytes straight to Drive → finalize (server re-validates + activates).
 *
 * PRIMARY PATH (below) = direct browser→Drive. It depends on the Phase 0 CORS
 * spike confirming Google returns permissive CORS for the resumable PUT.
 *
 * FALLBACK (if the spike shows CORS is blocked): swap the PUT step for a
 * direct upload to Supabase Storage via a signed URL (always CORS-clean), then
 * have the finalize endpoint copy the object into Drive server-side. The init/
 * finalize contracts stay identical; only this PUT changes.
 */
export function useResumableUpload() {
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  async function upload({ courseId, title, file }: UploadParams) {
    setStatus('uploading')
    setError(null)
    try {
      const init = await fetch('/api/uploads/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: courseId,
          title,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
        }),
      }).then((r) => r.json())
      if (!init.success) throw new Error(init.error ?? 'init failed')
      const { resource_id, sessionUri } = init.data

      const put = await fetch(sessionUri, { method: 'PUT', body: file })
      if (!put.ok) throw new Error(`upload failed: ${put.status}`)
      const uploaded = await put.json()

      const fin = await fetch('/api/uploads/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id, drive_file_id: uploaded.id }),
      }).then((r) => r.json())
      if (!fin.success) throw new Error(fin.error ?? 'finalize failed')

      setStatus('done')
      return fin.data
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload error')
      setStatus('error')
      return null
    }
  }

  return { upload, status, error }
}

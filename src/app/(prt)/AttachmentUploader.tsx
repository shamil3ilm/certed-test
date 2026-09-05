'use client'

import { useRef, useState } from 'react'
import type { AttachmentView } from './AttachmentList'

type OwnerKind = 'submission' | 'resource' | 'announcement' | 'assignment'

/** Extensions the server accepts (see lib/attachments/validation). Used only to
 *  pre-filter the OS file dialog - the server re-validates authoritatively. */
const DEFAULT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.zip'

/**
 * Uploads a file to the academy's custodial storage and attaches it to an existing
 * owner (submission / resource / announcement). It streams the bytes to the server
 * route, which owns the two-phase commit to Drive; nothing here touches Google, and
 * the file is never shared publicly. Surfaces the uploading / failed states and a
 * retry, and hands the finished attachment back to the caller to render.
 */
export function AttachmentUploader({
  owner,
  ownerId,
  resolveOwnerId,
  onUploaded,
  accept = DEFAULT_ACCEPT,
}: {
  owner: OwnerKind
  /** A known owner id, OR use `resolveOwnerId` to create/resolve one on first upload. */
  ownerId?: string
  /** Resolve (creating if needed) the owner id just before the first upload - e.g. a
   *  submission that is created empty when the student attaches their first file.
   *  Throws with a user-safe message to abort. */
  resolveOwnerId?: () => Promise<string>
  onUploaded?: (attachment: AttachmentView) => void
  accept?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'uploading' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setState('uploading')
    setError(null)

    let id = ownerId ?? null
    if (resolveOwnerId) {
      try {
        id = await resolveOwnerId()
      } catch (resolveError) {
        setError(resolveError instanceof Error ? resolveError.message : 'Could not start the upload.')
        setState('failed')
        return
      }
    }
    if (!id) {
      setError('There is nothing to attach this file to yet.')
      setState('failed')
      return
    }

    const form = new FormData()
    form.append('file', file)
    form.append('owner', owner)
    form.append('ownerId', id)
    try {
      const res = await fetch('/api/attachments', { method: 'POST', body: form })
      const json = (await res.json().catch(() => null)) as
        { success: true; data: AttachmentView } | { success: false; error: string } | null
      if (!res.ok || !json?.success) {
        // The server's envelope message is already masked to something user-safe
        // (validation / permission), so it is safe to show; a raw fetch failure
        // falls through to the catch and the generic message.
        setError((json && 'error' in json && json.error) || 'Upload failed. Please try again.')
        setState('failed')
        return
      }
      setState('idle')
      if (inputRef.current) inputRef.current.value = ''
      onUploaded?.(json.data)
    } catch {
      setError('Upload failed. Please try again.')
      setState('failed')
    }
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        aria-label={`Attach a file to this ${owner}`}
        disabled={state === 'uploading'}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20 disabled:opacity-50"
      />
      {state === 'uploading' && <p className="text-xs text-slate-600">Uploading...</p>}
      {state === 'failed' && error && (
        <p role="alert" className="text-sm text-red-600">
          {error}{' '}
          <button type="button" onClick={() => inputRef.current?.click()} className="font-medium underline">
            Retry
          </button>
        </p>
      )}
    </div>
  )
}

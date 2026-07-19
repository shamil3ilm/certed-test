'use client'

import { useState, useTransition } from 'react'
import { checkDriveLink } from '@/lib/drive-link'
import { shareAnyoneWithLink } from '@/lib/google/drive-share'
import { isPickerConfigured } from '@/lib/google/drive-config'
import { getDriveAccessToken, showDrivePicker } from '@/lib/google/picker'
import { assertActionOk } from '../action-client'
import { useUI } from '../Providers'
import { submitLinkAction } from './submit-actions'

export function SubmitForm({ assignmentId, studentEmail }: { assignmentId: string; studentEmail?: string }) {
  const [url, setUrl] = useState('')
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useUI()
  const linkCheck = checkDriveLink(url)
  const pickerEnabled = isPickerConfigured()

  function record(link: string, fileName?: string) {
    const formData = new FormData()
    formData.set('assignment_id', assignmentId)
    formData.set('url', link)
    if (fileName) formData.set('file_name', fileName)

    startTransition(async () => {
      try {
        assertActionOk(await submitLinkAction(formData), 'Could not submit')
        setUrl('')
        toast('Submitted', 'success')
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : 'Could not submit'
        setError(message)
        toast(message, 'error')
      }
    })
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const link = url.trim()
    if (!link) return
    setError(null)
    record(link)
  }

  async function onAttachFromDrive() {
    setError(null)
    setBusy(true)

    try {
      const token = await getDriveAccessToken(studentEmail)
      const picked = await showDrivePicker(token)
      if (!picked) return

      try {
        await shareAnyoneWithLink(picked.id, token)
      } catch {
        toast('Uploaded, but please set sharing to "Anyone with the link" yourself', 'error')
      }

      record(picked.url, picked.name)
    } catch (pickerError) {
      const message = pickerError instanceof Error ? pickerError.message : 'Could not connect to Google Drive'
      setError(message)
      toast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const pasteForm = (
    <form onSubmit={onSubmit} className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste your Google Drive link..."
          required
          disabled={isPending}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
        />
        <button disabled={isPending} className="btn btn-primary btn-sm">
          {isPending ? 'Submitting...' : 'Submit link'}
        </button>
      </div>
      {linkCheck === 'folder' && (
        <p className="text-xs text-amber-600">
          That looks like a Drive <span className="font-medium">folder</span> link - share the specific file so your tutor sees just your work.
        </p>
      )}
      {linkCheck === 'not-drive' && (
        <p className="text-xs text-amber-600">
          That does not look like a Google Drive link. You can still submit it - just make sure it opens for your tutor, not only for you.
        </p>
      )}
      <p className="text-xs text-slate-400">
        Tip: in Drive, set sharing to <span className="font-medium text-slate-500">"Anyone with the link"</span>. To be sure, open your link in a private/incognito window - if it opens there, your tutor can see it.
      </p>
      <p className="text-xs text-slate-400">
        Naming your file <span className="font-medium text-slate-500">YYYY-MM-DD-topic</span> keeps it easy to find and stops a re-upload from overwriting an earlier version.
      </p>
    </form>
  )

  return (
    <div className="mt-2 space-y-2">
      {pickerEnabled ? (
        <>
          <button
            type="button"
            onClick={onAttachFromDrive}
            disabled={busy || isPending}
            className="btn btn-primary btn-sm"
          >
            {busy ? 'Opening Drive...' : 'Attach from Drive'}
          </button>
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500">or paste a link</summary>
            {pasteForm}
          </details>
        </>
      ) : (
        pasteForm
      )}

      <p className="text-xs text-slate-400">
        The academy <span className="font-medium text-slate-500">links</span> to your file - it does not keep a copy. Leave it in your Drive until the term ends.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

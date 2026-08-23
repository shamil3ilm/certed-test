'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { checkDriveLink } from '@/lib/drive-link'
import { assertActionOk } from '../action-client'
import { useUI } from '../Providers'
import { AttachmentUploader } from '../AttachmentUploader'
import { AttachmentList, type AttachmentView } from '../AttachmentList'
import { MAX_ATTACHMENTS_PER_OWNER } from '@/lib/attachments/validation'
import { startSubmissionAction, submitLinkAction } from './submit-actions'

/**
 * Submit work by UPLOADING a file the academy keeps (custodial storage), with a
 * Google Drive link kept only as a de-emphasized fallback. The old "Attach from
 * Drive" Picker - which shared the file "anyone with the link" - is gone. The first
 * upload creates the (empty) submission and subsequent files attach to the same one.
 */
export function SubmitForm({
  assignmentId,
  submissionId,
  initialAttachments = [],
}: {
  assignmentId: string
  submissionId?: string | null
  initialAttachments?: AttachmentView[]
}) {
  const router = useRouter()
  const { toast } = useUI()
  const [attachments, setAttachments] = useState<AttachmentView[]>(initialAttachments)
  const [submission, setSubmission] = useState<string | null>(submissionId ?? null)
  const [url, setUrl] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const linkCheck = checkDriveLink(url)

  // Resolve (creating on the first file) the submission this upload attaches to, then
  // reuse it so a second file lands on the SAME submission.
  async function resolveSubmissionId(): Promise<string> {
    if (submission) return submission
    const result = await startSubmissionAction(assignmentId)
    if (!result.ok) throw new Error(result.error)
    setSubmission(result.submissionId)
    return result.submissionId
  }

  function onUploaded(attachment: AttachmentView) {
    setAttachments((prev) => [attachment, ...prev])
    toast('File uploaded', 'success')
    router.refresh() // re-render the submission status the server shows above this form
  }

  function onSubmitLink(event: React.FormEvent) {
    event.preventDefault()
    const link = url.trim()
    if (!link) return
    setError(null)
    const formData = new FormData()
    formData.set('assignment_id', assignmentId)
    formData.set('url', link)
    startTransition(async () => {
      try {
        assertActionOk(await submitLinkAction(formData), 'Could not submit')
        setUrl('')
        toast('Submitted', 'success')
        router.refresh()
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : 'Could not submit'
        setError(message)
        toast(message, 'error')
      }
    })
  }

  return (
    <div className="mt-2 space-y-2">
      {attachments.length > 0 && <AttachmentList attachments={attachments} />}

      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Upload your work</p>
        {attachments.length < MAX_ATTACHMENTS_PER_OWNER ? (
          <>
            <AttachmentUploader owner="submission" resolveOwnerId={resolveSubmissionId} onUploaded={onUploaded} />
            <p className="mt-1 text-xs text-slate-400">
              Kept by the academy - PDF, Office documents, images or zip, up to 25 MB.
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-400">
            You&apos;ve attached the maximum of {MAX_ATTACHMENTS_PER_OWNER} files.
          </p>
        )}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-slate-500">or submit a Google Drive link instead</summary>
        <form onSubmit={onSubmitLink} className="mt-1.5 space-y-1.5">
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste your Google Drive link..."
            aria-label="Google Drive link"
            required
            disabled={isPending}
            className="min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
          <button type="submit" disabled={isPending} className="btn btn-primary btn-sm">
            {isPending ? 'Submitting...' : 'Submit link'}
          </button>
          {linkCheck === 'folder' && (
            <p className="text-amber-600">
              That looks like a Drive <span className="font-medium">folder</span> link - share the specific file so your
              tutor sees just your work.
            </p>
          )}
          {linkCheck === 'not-drive' && (
            <p className="text-amber-600">
              That does not look like a Google Drive link. Make sure it opens for your tutor, not only for you.
            </p>
          )}
          <p className="text-slate-400">
            A link is stored outside the academy - if you can, upload the file above instead so we keep a copy.
          </p>
        </form>
      </details>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

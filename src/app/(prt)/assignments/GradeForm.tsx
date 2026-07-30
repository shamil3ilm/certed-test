'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { assertActionOk } from '../action-client'
import { gradeSubmissionAction } from './manage-actions'
import { useUI } from '../Providers'

export function GradeForm({
  submissionId,
  assignmentId,
  maxMarks,
  score,
  feedback,
}: {
  submissionId: string
  assignmentId: string
  maxMarks: number | null
  score: number | null
  feedback: string | null
}) {
  const router = useRouter()
  const { confirm, toast } = useUI()
  const [busy, setBusy] = useState(false)
  const [scoreValue, setScoreValue] = useState(score != null ? String(Number(score)) : '')
  const [feedbackValue, setFeedbackValue] = useState(feedback ?? '')
  const isGraded = score != null

  // Re-seed from the server when its view of this submission's grade changes - a
  // concurrent grade, or a router.refresh() from a sibling action re-rendering
  // this keyed form. useState captures the props once, so without this the inputs
  // would keep stale values and a save could silently revert the newer grade.
  // Keyed on the score/feedback signature: a tutor's own save re-renders to the
  // value they just typed (no visible change), so in-progress typing isn't lost.
  const serverSignature = `${score ?? ''}|${feedback ?? ''}`
  const [seededSignature, setSeededSignature] = useState(serverSignature)
  if (seededSignature !== serverSignature) {
    setSeededSignature(serverSignature)
    setScoreValue(score != null ? String(Number(score)) : '')
    setFeedbackValue(feedback ?? '')
  }

  async function saveGrade(sendScore: string, sendFeedback: string, okMessage: string, failMessage: string) {
    setBusy(true)
    const formData = new FormData()
    formData.set('submission_id', submissionId)
    formData.set('assignment_id', assignmentId)
    formData.set('score', sendScore)
    formData.set('feedback', sendFeedback)

    try {
      assertActionOk(await gradeSubmissionAction(formData), failMessage)
      toast(okMessage, 'success')
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : failMessage, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    await saveGrade(scoreValue, feedbackValue, 'Mark saved', 'Could not save the mark')
  }

  // Reopen = clear the mark (empty score). A graded submission blocks the
  // student's resubmission; clearing it lets them submit again. This makes the
  // "ask your tutor to reopen it" instruction an actual, discoverable control.
  async function onReopen() {
    // Destructive: reopening clears the student's mark AND feedback so they can
    // resubmit. Confirm first - the app confirms far lighter actions (archiving a
    // post), so wiping a grade shouldn't be a single unguarded click.
    const confirmed = await confirm({
      title: 'Reopen for resubmission?',
      message:
        "This clears the current mark and feedback so the student can submit again. You'll need to mark it afresh.",
      confirmLabel: 'Reopen',
      variant: 'danger',
    })
    if (!confirmed) return
    setScoreValue('')
    setFeedbackValue('')
    await saveGrade('', '', 'Reopened for resubmission', 'Could not reopen the submission')
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
      <label className="text-xs font-medium text-slate-500">
        Mark {maxMarks != null && <span className="text-slate-400">/ {Number(maxMarks)}</span>}
        <input
          type="number"
          step="0.5"
          min="0"
          max={maxMarks != null ? Number(maxMarks) : undefined}
          value={scoreValue}
          onChange={(event) => setScoreValue(event.target.value)}
          placeholder="-"
          className="mt-1 block w-24 rounded border px-2 py-1 text-sm"
        />
      </label>
      <label className="min-w-[12rem] flex-1 text-xs font-medium text-slate-500">
        Feedback (optional)
        <input
          value={feedbackValue}
          onChange={(event) => setFeedbackValue(event.target.value)}
          placeholder="Well done - recheck Q5."
          className="mt-1 block w-full rounded border px-2 py-1 text-sm"
        />
      </label>
      <button type="submit" disabled={busy} className="btn btn-sm btn-primary">
        {busy ? 'Saving...' : 'Save mark'}
      </button>
      {isGraded && (
        <button type="button" disabled={busy} onClick={onReopen} className="btn btn-sm btn-ghost text-amber-700">
          Reopen for resubmission
        </button>
      )}
    </form>
  )
}

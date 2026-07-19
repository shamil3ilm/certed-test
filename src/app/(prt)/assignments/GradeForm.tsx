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
  const { toast } = useUI()
  const [busy, setBusy] = useState(false)
  const [scoreValue, setScoreValue] = useState(score != null ? String(Number(score)) : '')
  const [feedbackValue, setFeedbackValue] = useState(feedback ?? '')
  const isGraded = score != null

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
      <button disabled={busy} className="btn btn-sm btn-primary">
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

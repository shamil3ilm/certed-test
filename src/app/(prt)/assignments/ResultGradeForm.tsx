'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { assertActionOk } from '../action-client'
import { recordResultAction } from './manage-actions'
import { useUI } from '../Providers'

/** Records a mark for IN-PERSON work, keyed on (assignment, student) instead of a
 *  submission id - there may be no submission. Unlike GradeForm there's no "reopen"
 *  (nothing for the student to resubmit). */
export function ResultGradeForm({
  assignmentId,
  studentId,
  maxMarks,
  score,
  feedback,
}: {
  assignmentId: string
  studentId: string
  maxMarks: number | null
  score: number | null
  feedback: string | null
}) {
  const router = useRouter()
  const { toast } = useUI()
  const [busy, setBusy] = useState(false)
  const [scoreValue, setScoreValue] = useState(score != null ? String(Number(score)) : '')
  const [feedbackValue, setFeedbackValue] = useState(feedback ?? '')

  // Re-seed from the server when its view of this mark changes (mirrors GradeForm):
  // useState captures props once, so a concurrent grade or a sibling refresh would
  // otherwise leave stale inputs that could revert the newer mark on save.
  const serverSignature = `${score ?? ''}|${feedback ?? ''}`
  const [seededSignature, setSeededSignature] = useState(serverSignature)
  if (seededSignature !== serverSignature) {
    setSeededSignature(serverSignature)
    setScoreValue(score != null ? String(Number(score)) : '')
    setFeedbackValue(feedback ?? '')
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const formData = new FormData()
    formData.set('assignment_id', assignmentId)
    formData.set('student_id', studentId)
    formData.set('score', scoreValue)
    formData.set('feedback', feedbackValue)
    try {
      assertActionOk(await recordResultAction(formData), 'Could not save the mark')
      toast('Mark saved', 'success')
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save the mark', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
      <label className="text-xs font-medium text-slate-600">
        Mark {maxMarks != null && <span className="text-slate-600">/ {Number(maxMarks)}</span>}
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
      <label className="min-w-[12rem] flex-1 text-xs font-medium text-slate-600">
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
      {maxMarks == null && (
        <p className="w-full text-xs text-amber-600">No max marks set - edit the assignment to grade out of a total.</p>
      )}
    </form>
  )
}

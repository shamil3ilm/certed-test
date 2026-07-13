'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { gradeSubmissionAction } from './manage-actions'
import { useUI } from '../Providers'

/** Tutor's inline mark + feedback control on the submission-review page. */
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
  const [s, setS] = useState(score != null ? String(score) : '')
  const [f, setF] = useState(feedback ?? '')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const fd = new FormData()
    fd.set('submission_id', submissionId)
    fd.set('assignment_id', assignmentId)
    fd.set('score', s)
    fd.set('feedback', f)
    try {
      await gradeSubmissionAction(fd)
      toast('Mark saved ✓', 'success')
      router.refresh()
    } catch {
      toast('Could not save the mark', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
      <label className="text-xs font-medium text-slate-500">
        Mark {maxMarks != null && <span className="text-slate-400">/ {maxMarks}</span>}
        <input
          type="number"
          step="0.5"
          min="0"
          max={maxMarks ?? undefined}
          value={s}
          onChange={(e) => setS(e.target.value)}
          placeholder="—"
          className="mt-1 block w-24 rounded border px-2 py-1 text-sm"
        />
      </label>
      <label className="min-w-[12rem] flex-1 text-xs font-medium text-slate-500">
        Feedback (optional)
        <input
          value={f}
          onChange={(e) => setF(e.target.value)}
          placeholder="Well done — recheck Q5…"
          className="mt-1 block w-full rounded border px-2 py-1 text-sm"
        />
      </label>
      <button disabled={busy} className="btn btn-sm btn-primary">
        {busy ? 'Saving…' : 'Save mark'}
      </button>
    </form>
  )
}

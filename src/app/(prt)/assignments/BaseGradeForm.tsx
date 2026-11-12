'use client'

import { useState, type FormEvent, type ReactNode } from 'react'

export interface BaseGradeFormProps {
  maxMarks: number | null
  score: number | null
  feedback: string | null
  busy?: boolean
  onSubmit: (score: string, feedback: string) => Promise<void>
  extraActions?: ReactNode
}

/**
 * Shared form layout, score input validation, feedback field, and re-seeding
 * behavior for both digital (GradeForm) and in-person (ResultGradeForm) grading.
 */
export function BaseGradeForm({ maxMarks, score, feedback, busy = false, onSubmit, extraActions }: BaseGradeFormProps) {
  const [scoreValue, setScoreValue] = useState(score != null ? String(Number(score)) : '')
  const [feedbackValue, setFeedbackValue] = useState(feedback ?? '')

  // Re-seed from the server when its view of this submission's grade changes - a
  // concurrent grade, or a router.refresh() from a sibling action re-rendering
  // this keyed form. Keyed on the score/feedback signature: a tutor's own save re-renders
  // to the value they just typed, so in-progress typing isn't lost.
  const serverSignature = `${score ?? ''}|${feedback ?? ''}`
  const [seededSignature, setSeededSignature] = useState(serverSignature)
  if (seededSignature !== serverSignature) {
    setSeededSignature(serverSignature)
    setScoreValue(score != null ? String(Number(score)) : '')
    setFeedbackValue(feedback ?? '')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await onSubmit(scoreValue, feedbackValue)
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
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
      {extraActions}
      {maxMarks == null && (
        <p className="w-full text-xs text-warning-ink">
          No max marks set - edit the assignment to grade out of a total.
        </p>
      )}
    </form>
  )
}

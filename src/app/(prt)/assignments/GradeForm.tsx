'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assertActionOk } from '../action-client'
import { gradeSubmissionAction } from './manage-actions'
import { useUI } from '../Providers'
import { BaseGradeForm } from './BaseGradeForm'

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

  // Reopen = clear the mark (empty score). A graded submission blocks the
  // student's resubmission; clearing it lets them submit again. This makes the
  // "ask your tutor to reopen it" instruction an actual, discoverable control.
  async function onReopen() {
    const confirmed = await confirm({
      title: 'Reopen for resubmission?',
      message:
        "This clears the current mark and feedback so the student can submit again. You'll need to mark it afresh.",
      confirmLabel: 'Reopen',
      variant: 'danger',
    })
    if (!confirmed) return
    await saveGrade('', '', 'Reopened for resubmission', 'Could not reopen the submission')
  }

  return (
    <BaseGradeForm
      maxMarks={maxMarks}
      score={score}
      feedback={feedback}
      busy={busy}
      onSubmit={(s, f) => saveGrade(s, f, 'Mark saved', 'Could not save the mark')}
      extraActions={
        isGraded ? (
          <button type="button" disabled={busy} onClick={onReopen} className="btn btn-sm btn-ghost text-warning-ink">
            Reopen for resubmission
          </button>
        ) : undefined
      }
    />
  )
}

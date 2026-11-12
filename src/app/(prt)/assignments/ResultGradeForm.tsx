'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assertActionOk } from '../action-client'
import { recordResultAction } from './manage-actions'
import { useUI } from '../Providers'
import { BaseGradeForm } from './BaseGradeForm'

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

  async function handleSave(scoreValue: string, feedbackValue: string) {
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

  return <BaseGradeForm maxMarks={maxMarks} score={score} feedback={feedback} busy={busy} onSubmit={handleSave} />
}

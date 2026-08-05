'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { assertActionOk } from '../../../action-client'
import { useUI } from '../../../Providers'
import { saveFeedbackAction } from './actions'

/** A student's feedback on one of their sessions. Prefilled with any saved note;
 *  saving is best-effort with a toast, then a refresh to show the stored value. */
export function SessionFeedbackForm({
  classId,
  date,
  initial,
}: {
  classId: string
  date: string
  initial: string | null
}) {
  const [text, setText] = useState(initial ?? '')
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const { toast } = useUI()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const formData = new FormData()
    formData.set('class_id', classId)
    formData.set('session_date', date)
    formData.set('feedback', text.trim())
    try {
      assertActionOk(await saveFeedbackAction(formData), 'Could not save feedback')
      toast('Feedback saved', 'success')
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save feedback', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-2">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="How was this session? Anything you'd like your tutor to know..."
        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
      />
      <button type="submit" disabled={busy} className="btn btn-sm btn-soft">
        {busy ? 'Saving...' : 'Save feedback'}
      </button>
    </form>
  )
}

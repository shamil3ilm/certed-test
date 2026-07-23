'use client'

import { useTransition } from 'react'
import { assertActionOk } from '../action-client'
import { useUI } from '../Providers'
import { withdrawSubmissionAction } from './submit-actions'

/** Lets a student retract their own ungraded submission (they can resubmit after).
 *  Graded work is blocked server-side, so this only shows for ungraded submissions. */
export function WithdrawButton({ submissionId }: { submissionId: string }) {
  const [pending, startTransition] = useTransition()
  const { toast } = useUI()

  function onClick() {
    if (!window.confirm('Withdraw this submission? You can submit again afterwards.')) return
    const formData = new FormData()
    formData.set('submission_id', submissionId)
    startTransition(async () => {
      try {
        assertActionOk(await withdrawSubmissionAction(formData), 'Could not withdraw')
        toast('Submission withdrawn', 'success')
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not withdraw', 'error')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
    >
      {pending ? 'Withdrawing...' : 'Withdraw submission'}
    </button>
  )
}

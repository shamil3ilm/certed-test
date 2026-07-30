'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MESSAGING_PERSONAS, pairKey, type MessagingPersona } from '@/lib/messaging/matrix'
import { assertActionOk } from '../../action-client'
import { useUI } from '../../Providers'
import { saveMessagingMatrixAction } from './actions'

const LABELS: Record<MessagingPersona, string> = {
  admin: 'Admin',
  sub_admin: 'Sub-admin',
  tutor: 'Tutor',
  mentor: 'Mentor',
  student: 'Student',
}

export function MessagingMatrixForm({ initialEnabled }: { initialEnabled: Record<string, boolean> }) {
  const router = useRouter()
  const { toast } = useUI()
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(Object.keys(initialEnabled)))
  const [isPending, startTransition] = useTransition()

  function toggle(a: MessagingPersona, b: MessagingPersona) {
    const key = pairKey(a, b)
    setEnabled((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const formData = new FormData()
    for (const key of enabled) formData.append('pair', key)
    startTransition(async () => {
      try {
        assertActionOk(await saveMessagingMatrixAction(formData), 'Could not save messaging settings')
        toast('Messaging settings saved', 'success')
        router.refresh()
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not save messaging settings', 'error')
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-slate-500">
              <th scope="col" className="p-2 text-left font-medium">
                Role
              </th>
              {MESSAGING_PERSONAS.map((p) => (
                <th key={p} scope="col" className="p-2 text-center font-medium">
                  {LABELS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MESSAGING_PERSONAS.map((a, rowIndex) => (
              <tr key={a} className="border-t border-slate-100">
                <th scope="row" className="p-2 text-left font-medium text-slate-700">
                  {LABELS[a]}
                </th>
                {MESSAGING_PERSONAS.map((b, colIndex) => {
                  // Pairs are unordered, so render one checkbox per pair (upper
                  // triangle incl. the diagonal); mirror the lower half as blank.
                  if (colIndex < rowIndex) return <td key={b} aria-hidden className="bg-slate-50/60" />
                  const key = pairKey(a, b)
                  return (
                    <td key={b} className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={enabled.has(key)}
                        onChange={() => toggle(a, b)}
                        disabled={isPending}
                        aria-label={`Allow ${LABELS[a]} and ${LABELS[b]} to message each other academy-wide`}
                        className="h-4 w-4 accent-primary"
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="submit" disabled={isPending} className="btn btn-primary">
        {isPending ? 'Saving...' : 'Save messaging access'}
      </button>
    </form>
  )
}

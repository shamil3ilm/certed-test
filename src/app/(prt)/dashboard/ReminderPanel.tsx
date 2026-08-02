'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Reminder } from '@/lib/services/reminders'
import { DISPLAY_TZ } from '@/lib/time/format'
import { createClientId } from '@/lib/ui/client-id'
import { useHydratedFlag } from '@/lib/ui/client-env'
import { assertActionOk } from '../action-client'
import { useUI } from '../Providers'
import { createReminderAction, deleteReminderAction, editReminderAction, markReminderSentAction } from './actions'
import { PastReminderList, ReminderEditor, ReminderItems } from './reminder-panel-parts'

const NOW_REFRESH_MS = 60_000

export function ReminderPanel({
  initialReminders,
  initialPastReminders = [],
  now,
}: {
  initialReminders: Reminder[]
  initialPastReminders?: Reminder[]
  now: number
}) {
  const serverSignature = [...initialReminders, ...initialPastReminders]
    .map((r) => `${r.id}:${r.is_sent ? '1' : '0'}`)
    .join('|')

  return (
    <ReminderPanelBody
      key={serverSignature}
      initialReminders={initialReminders}
      initialPastReminders={initialPastReminders}
      now={now}
    />
  )
}

function ReminderPanelBody({
  initialReminders,
  initialPastReminders,
  now,
}: {
  initialReminders: Reminder[]
  initialPastReminders: Reminder[]
  now: number
}) {
  const [reminders, setReminders] = useState(initialReminders)
  const [pastReminders, setPastReminders] = useState(initialPastReminders)
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Reminder | null>(null)
  // Seed from the server-provided timestamp so SSR and the first client render
  // agree (a client-side Date.now() here can straddle a minute/overdue boundary
  // and trip a hydration mismatch); the interval below takes over after mount.
  const [nowMs, setNowMs] = useState(now)
  const deviceLocal = useHydratedFlag()
  const { toast } = useUI()
  const router = useRouter()

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), NOW_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [])

  function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const title = String(formData.get('title') ?? '').trim()
    const remindAt = String(formData.get('remind_at') ?? '').trim()
    if (!title || !remindAt) return

    // The datetime-local input yields "2026-12-30T09:00" (no seconds, no zone),
    // but the server requires strict ISO-8601 (z.string().datetime()). Convert and
    // write it back onto the SUBMITTED formData - not just the optimistic object
    // below - or creation always fails validation and reverts.
    const remindAtDate = new Date(remindAt)
    if (Number.isNaN(remindAtDate.getTime())) return
    const remindAtIso = remindAtDate.toISOString()
    formData.set('remind_at', remindAtIso)
    const description = String(formData.get('description') ?? '').trim() || null

    // Edit mode: update the existing reminder in place instead of appending.
    if (editing) {
      const target = editing
      formData.set('id', target.id)
      const snapshot = reminders
      setReminders((current) =>
        current.map((r) => (r.id === target.id ? { ...r, title, description, remind_at: remindAtIso } : r)),
      )
      setEditing(null)
      setOpen(false)
      startTransition(async () => {
        try {
          assertActionOk(await editReminderAction(formData), 'Could not update reminder')
          router.refresh()
        } catch {
          setReminders(snapshot)
          toast('Could not update reminder', 'error')
        }
      })
      return
    }

    const snapshot = reminders
    setReminders((current) => [
      ...current,
      {
        id: createClientId('temp'),
        user_id: '',
        title,
        description,
        remind_at: remindAtIso,
        is_sent: false,
        created_at: new Date().toISOString(),
      },
    ])
    setOpen(false)

    startTransition(async () => {
      try {
        assertActionOk(await createReminderAction(formData), 'Could not save reminder')
        router.refresh()
      } catch {
        setReminders(snapshot)
        toast('Could not save reminder', 'error')
      }
    })
  }

  function handleDelete(id: string) {
    const snapshot = reminders
    setReminders((current) => current.filter((reminder) => reminder.id !== id))
    const formData = new FormData()
    formData.set('id', id)

    startTransition(async () => {
      try {
        assertActionOk(await deleteReminderAction(formData), 'Could not delete reminder')
      } catch {
        setReminders(snapshot)
        toast('Could not delete reminder', 'error')
      }
    })
  }

  function handleMarkDone(reminder: Reminder) {
    const snapshot = reminders
    const pastSnapshot = pastReminders
    setReminders((current) => current.filter((item) => item.id !== reminder.id))
    setPastReminders((current) => [{ ...reminder, is_sent: true }, ...current])
    const formData = new FormData()
    formData.set('id', reminder.id)

    startTransition(async () => {
      try {
        assertActionOk(await markReminderSentAction(formData), 'Could not mark reminder done')
      } catch {
        setReminders(snapshot)
        setPastReminders(pastSnapshot)
        toast('Could not mark reminder done', 'error')
      }
    })
  }

  const sorted = [...reminders].sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime())

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Reminders
          {reminders.length > 0 && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {reminders.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setOpen((value) => !value)
          }}
          aria-expanded={open}
          aria-controls="reminder-add-form"
          className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-primary hover:bg-primary/5 hover:text-primary"
        >
          + Add
        </button>
      </div>

      {open && (
        <ReminderEditor
          editing={editing}
          isPending={isPending}
          onSubmit={handleAdd}
          onCancel={() => {
            setOpen(false)
            setEditing(null)
          }}
        />
      )}

      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No upcoming reminders.</p>
      ) : (
        <ReminderItems
          reminders={sorted}
          nowMs={nowMs}
          displayTz={deviceLocal ? undefined : DISPLAY_TZ}
          onEdit={(reminder) => {
            setEditing(reminder)
            setOpen(true)
          }}
          onMarkDone={handleMarkDone}
          onDelete={handleDelete}
          isPending={isPending}
        />
      )}

      <PastReminderList reminders={pastReminders} displayTz={deviceLocal ? undefined : DISPLAY_TZ} />
    </section>
  )
}

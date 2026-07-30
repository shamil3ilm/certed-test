'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Reminder } from '@/lib/services/reminders'
import { formatDate, formatDateTime, DISPLAY_TZ } from '@/lib/time/format'
import { ARCHIVED_ROW } from '@/lib/ui'
import { createClientId } from '@/lib/ui/client-id'
import { useHydratedFlag } from '@/lib/ui/client-env'
import { assertActionOk } from '../action-client'
import { useUI } from '../Providers'
import { createReminderAction, deleteReminderAction, markReminderSentAction } from './actions'

const NOW_REFRESH_MS = 60_000

function formatRemindAt(iso: string, nowMs: number, tz?: string) {
  const date = new Date(iso)
  const diff = date.getTime() - nowMs
  if (diff < 0) return { label: formatDateTime(iso, tz), overdue: true }
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return { label: `in ${hours}h`, overdue: false }
  const days = Math.floor(diff / 86400000)
  return { label: `in ${days}d - ${formatDate(iso, tz)}`, overdue: false }
}

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

    const snapshot = reminders
    setReminders((current) => [
      ...current,
      {
        id: createClientId('temp'),
        user_id: '',
        title,
        description: String(formData.get('description') ?? '').trim() || null,
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
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="reminder-add-form"
          className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-primary hover:bg-primary/5 hover:text-primary"
        >
          + Add
        </button>
      </div>

      {open && (
        <form
          id="reminder-add-form"
          onSubmit={handleAdd}
          className="mt-3 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Title</span>
            <input
              name="title"
              required
              placeholder="Reminder title..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Note</span>
            <input
              name="description"
              placeholder="Note (optional)"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">When</span>
            <input
              name="remind_at"
              type="datetime-local"
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="btn btn-primary btn-sm flex-1">
              Save
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No upcoming reminders.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {sorted.map((reminder) => {
            const { label, overdue } = formatRemindAt(reminder.remind_at, nowMs, deviceLocal ? undefined : DISPLAY_TZ)
            return (
              <li
                key={reminder.id}
                className={`flex items-start gap-3 rounded-xl border p-2.5 transition hover:shadow-sm ${
                  overdue ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'
                }`}
              >
                <span className={`mt-0.5 text-sm ${overdue ? 'text-red-500' : 'text-primary'}`}>Clock</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{reminder.title}</p>
                  {reminder.description && (
                    <p className="mt-0.5 truncate text-xs text-slate-500">{reminder.description}</p>
                  )}
                  <p
                    suppressHydrationWarning
                    className={`mt-0.5 text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-400'}`}
                  >
                    {label}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleMarkDone(reminder)}
                  disabled={isPending}
                  aria-label="Mark reminder done"
                  className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-emerald-100 hover:text-emerald-600 disabled:opacity-50"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(reminder.id)}
                  disabled={isPending}
                  aria-label="Delete reminder"
                  className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {pastReminders.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-primary">
            {pastReminders.length} past reminder{pastReminders.length !== 1 ? 's' : ''}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {pastReminders.map((reminder) => (
              <li key={reminder.id} className={ARCHIVED_ROW}>
                <span className="truncate text-slate-500">{reminder.title}</span>
                <span suppressHydrationWarning className="shrink-0 text-xs text-slate-400">
                  {formatDate(reminder.remind_at, deviceLocal ? undefined : DISPLAY_TZ)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Reminder } from '@/lib/repos/reminders'
import { createReminderAction, deleteReminderAction } from './actions'
import { useUI } from '../Providers'
import { formatDate, formatDateTime, DISPLAY_TZ } from '@/lib/time/format'

function formatRemindAt(iso: string, tz?: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  if (diff < 0) return { label: formatDateTime(iso, tz), overdue: true }
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return { label: `in ${hours}h`, overdue: false }
  const days = Math.floor(diff / 86400000)
  return { label: `in ${days}d · ${formatDate(iso, tz)}`, overdue: false }
}

export function ReminderPanel({ initialReminders }: { initialReminders: Reminder[] }) {
  const [reminders, setReminders] = useState(initialReminders)
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  // SSR/first render use the institute zone; after mount, the viewer's device zone.
  const [deviceLocal, setDeviceLocal] = useState(false)
  useEffect(() => setDeviceLocal(true), [])
  const { toast } = useUI()
  const router = useRouter()

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const title = String(fd.get('title') ?? '').trim()
    const remind_at = String(fd.get('remind_at') ?? '').trim()
    if (!title || !remind_at) return
    // Optimistic add, rolled back if the server rejects.
    const snapshot = reminders
    setReminders((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        user_id: '',
        title,
        description: String(fd.get('description') ?? '').trim() || null,
        remind_at: new Date(remind_at).toISOString(),
        is_sent: false,
        created_at: new Date().toISOString(),
      },
    ])
    setOpen(false)
    startTransition(async () => {
      try {
        await createReminderAction(fd)
        router.refresh() // reconcile the temp id with the saved row
      } catch {
        setReminders(snapshot)
        toast('Could not save reminder', 'error')
      }
    })
  }

  function handleDelete(id: string) {
    const snapshot = reminders
    setReminders((prev) => prev.filter((r) => r.id !== id))
    const fd = new FormData()
    fd.set('id', id)
    startTransition(async () => {
      try {
        await deleteReminderAction(fd)
      } catch {
        setReminders(snapshot)
        toast('Could not delete reminder', 'error')
      }
    })
  }

  const sorted = [...reminders].sort(
    (a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime(),
  )

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          🔔 Reminders{reminders.length > 0 && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{reminders.length}</span>}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-primary hover:bg-primary/5 hover:text-primary"
        >
          + Add
        </button>
      </div>

      {/* Add form */}
      {open && (
        <form onSubmit={handleAdd} className="mt-3 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <input
            name="title"
            required
            placeholder="Reminder title…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            name="description"
            placeholder="Note (optional)"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none"
          />
          <input
            name="remind_at"
            type="datetime-local"
            required
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="flex-1 rounded-lg bg-primary py-1.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Reminder list */}
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No upcoming reminders.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {sorted.map((r) => {
            const { label, overdue } = formatRemindAt(r.remind_at, deviceLocal ? undefined : DISPLAY_TZ)
            return (
              <li
                key={r.id}
                className={`flex items-start gap-3 rounded-xl border p-2.5 transition hover:shadow-sm ${
                  overdue ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'
                }`}
              >
                <span className={`mt-0.5 text-sm ${overdue ? 'text-red-500' : 'text-primary'}`}>⏰</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{r.title}</p>
                  {r.description && <p className="mt-0.5 truncate text-xs text-slate-500">{r.description}</p>}
                  <p suppressHydrationWarning className={`mt-0.5 text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-400'}`}>{label}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(r.id)}
                  disabled={isPending}
                  aria-label="Delete reminder"
                  className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

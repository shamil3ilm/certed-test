'use client'

import type { Reminder } from '@/lib/services/reminders'
import { ArchivedList } from '@/lib/ui'
import { formatDate, formatDateTime } from '@/lib/time/format'

export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

export function formatRemindAt(iso: string, nowMs: number, tz?: string) {
  const date = new Date(iso)
  const diff = date.getTime() - nowMs
  if (diff < 0) return { label: formatDateTime(iso, tz), overdue: true }

  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return { label: `in ${hours}h`, overdue: false }

  const days = Math.floor(diff / 86400000)
  return { label: `in ${days}d - ${formatDate(iso, tz)}`, overdue: false }
}

export function ReminderEditor({
  editing,
  isPending,
  onSubmit,
  onCancel,
}: {
  editing: Reminder | null
  isPending: boolean
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}) {
  return (
    <form
      id="reminder-add-form"
      key={editing?.id ?? 'new'}
      onSubmit={onSubmit}
      className="mt-3 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3"
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Title</span>
        <input
          name="title"
          required
          defaultValue={editing?.title ?? ''}
          placeholder="Reminder title..."
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Note</span>
        <input
          name="description"
          defaultValue={editing?.description ?? ''}
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
          defaultValue={editing ? toDatetimeLocalValue(editing.remind_at) : ''}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="btn btn-primary btn-sm flex-1">
          {editing ? 'Update' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          Cancel
        </button>
      </div>
    </form>
  )
}

export function ReminderItems({
  reminders,
  nowMs,
  displayTz,
  onEdit,
  onMarkDone,
  onDelete,
  isPending,
}: {
  reminders: Reminder[]
  nowMs: number
  displayTz?: string
  onEdit: (reminder: Reminder) => void
  onMarkDone: (reminder: Reminder) => void
  onDelete: (id: string) => void
  isPending: boolean
}) {
  return (
    <ul className="mt-3 space-y-2">
      {reminders.map((reminder) => {
        const { label, overdue } = formatRemindAt(reminder.remind_at, nowMs, displayTz)
        return (
          <li
            key={reminder.id}
            className={`flex items-start gap-3 rounded-xl border p-2.5 transition hover:shadow-sm ${
              overdue ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'
            }`}
          >
            <svg
              className={`mt-0.5 h-4 w-4 shrink-0 ${overdue ? 'text-red-500' : 'text-primary'}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{reminder.title}</p>
              {reminder.description && <p className="mt-0.5 truncate text-xs text-slate-500">{reminder.description}</p>}
              <p
                suppressHydrationWarning
                className={`mt-0.5 text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-400'}`}
              >
                {label}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onEdit(reminder)}
              disabled={isPending}
              aria-label="Edit reminder"
              className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-primary/10 hover:text-primary disabled:opacity-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onMarkDone(reminder)}
              disabled={isPending}
              aria-label="Mark reminder done"
              className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-emerald-100 hover:text-emerald-600 disabled:opacity-50"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => onDelete(reminder.id)}
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
  )
}

export function PastReminderList({ reminders, displayTz }: { reminders: Reminder[]; displayTz?: string }) {
  return (
    <ArchivedList
      count={reminders.length}
      singularLabel="past reminder"
      items={reminders.map((reminder) => ({
        key: reminder.id,
        label: reminder.title,
        meta: <span suppressHydrationWarning>{formatDate(reminder.remind_at, displayTz)}</span>,
      }))}
    />
  )
}

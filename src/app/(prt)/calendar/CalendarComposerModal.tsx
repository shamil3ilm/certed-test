'use client'

import { useEffect, useMemo, useState } from 'react'
import { pillButtonClass } from '@/lib/ui'
import { requestJson } from '../api-client'
import { Modal } from '../Modal'
import { calendarUrl, dayItemKey, firstAllowedTab } from './calendar-config'
import type { CalendarPayload, ComposerTab, DayItem, Opt } from './calendar-types'
import { AnnouncementCreateForm } from './composer/AnnouncementCreateForm'
import { CalendarEventForm } from './composer/CalendarEventForm'
import { ClassCreateForm } from './composer/ClassCreateForm'
import { MeetCreateForm } from './composer/MeetCreateForm'
import { ReminderCreateForm } from './composer/ReminderCreateForm'

const TAB_META: Record<ComposerTab, { title: string; description: string }> = {
  class: {
    title: 'Class',
    description: 'Schedule a one-off class session or a recurring weekly class.',
  },
  event: {
    title: 'Event / holiday',
    description: 'Add a dated calendar item such as an event, holiday, cancellation, or reschedule.',
  },
  announcement: {
    title: 'Announcement',
    description: 'Post an announcement to a class or across the academy.',
  },
  meet: {
    title: 'Meet',
    description: 'Share a meeting link with a class or globally, with an optional scheduled time.',
  },
  reminder: {
    title: 'Reminder',
    description: 'Create a personal reminder for the selected date and time.',
  },
}

export function CalendarComposerModal({
  date,
  initialTab,
  classes,
  tutors,
  isAdmin,
  canManageCalendar,
  canManageContent,
  canCreateReminder,
  onClose,
  onCalendarRefresh,
  onDone,
  toastMessage,
}: {
  date: string
  initialTab?: ComposerTab
  classes: Opt[]
  tutors: Opt[]
  isAdmin: boolean
  canManageCalendar: boolean
  canManageContent: boolean
  canCreateReminder: boolean
  onClose: () => void
  onCalendarRefresh: () => void
  onDone: () => void
  toastMessage: (message: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const tabs = useMemo(() => {
    const next: Array<{ id: ComposerTab; label: string }> = []
    if (canManageCalendar) {
      next.push({ id: 'class', label: 'Class' })
      next.push({ id: 'event', label: 'Event / holiday' })
    }
    if (canManageContent) next.push({ id: 'announcement', label: 'Announcement' })
    if (canManageContent) next.push({ id: 'meet', label: 'Meet' })
    if (canCreateReminder) next.push({ id: 'reminder', label: 'Reminder' })
    return next
  }, [canCreateReminder, canManageCalendar, canManageContent])

  const [activeTab, setActiveTab] = useState<ComposerTab>(
    () => initialTab ?? firstAllowedTab({ canManageCalendar, canCreateReminder, canManageContent }),
  )
  const [dayItems, setDayItems] = useState<DayItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const resolvedTab = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : firstAllowedTab({ canManageCalendar, canCreateReminder, canManageContent })
  const tabMeta = TAB_META[resolvedTab]

  useEffect(() => {
    const next = new Date(`${date}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)

    void requestJson<CalendarPayload>(calendarUrl(date, next.toISOString().slice(0, 10)))
      .then((data) => {
        setDayItems(data.items.map((item) => ({ title: item.title, kind: item.kind })))
        setLoadError(null)
      })
      .catch((error) => {
        setDayItems([])
        setLoadError(error instanceof Error ? error.message : 'Could not load that day')
      })
  }, [date])

  return (
    <Modal open onClose={onClose} title={`Add to ${date}`}>
      {loadError && <p className="mt-2 text-sm text-red-600">{loadError}</p>}

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
        <p className="font-medium text-slate-500">On this day</p>
        {dayItems.length === 0 ? (
          <p className="mt-1 text-slate-400">Nothing scheduled yet.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {dayItems.map((item, index) => (
              <li key={dayItemKey(item, index)} className="text-slate-600">
                - {item.title} <span className="text-slate-400">({item.kind})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={resolvedTab === tab.id}
            className={pillButtonClass(resolvedTab === tab.id, 'soft')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
        <p className="text-sm font-semibold text-slate-700">{tabMeta.title}</p>
        <p className="mt-1 text-sm text-slate-500">{tabMeta.description}</p>
      </div>

      {resolvedTab === 'class' && canManageCalendar && (
        <ClassCreateForm
          key={`class:${date}`}
          date={date}
          classes={classes}
          tutors={tutors}
          isAdmin={isAdmin}
          onSuccess={(message) => {
            toastMessage(message, 'success')
            onCalendarRefresh()
          }}
          onError={(message) => toastMessage(message, 'error')}
        />
      )}

      {resolvedTab === 'event' && canManageCalendar && (
        <CalendarEventForm
          key={`event:${date}`}
          date={date}
          classes={classes}
          isAdmin={isAdmin}
          onSuccess={() => {
            toastMessage('Added to schedule', 'success')
            onCalendarRefresh()
          }}
          onError={(message) => toastMessage(message, 'error')}
        />
      )}

      {resolvedTab === 'reminder' && canCreateReminder && (
        <ReminderCreateForm
          key={`reminder:${date}`}
          date={date}
          onSuccess={() => {
            toastMessage('Reminder added', 'success')
            onDone()
          }}
          onError={(message) => toastMessage(message, 'error')}
        />
      )}

      {resolvedTab === 'meet' && canManageContent && (
        <MeetCreateForm
          key={`meet:${date}`}
          date={date}
          classes={classes}
          isAdmin={isAdmin}
          onSuccess={() => {
            toastMessage('Meet link shared', 'success')
            onCalendarRefresh()
          }}
          onError={(message) => toastMessage(message, 'error')}
        />
      )}

      {resolvedTab === 'announcement' && canManageContent && (
        <AnnouncementCreateForm
          key={`announcement:${date}`}
          date={date}
          classes={classes}
          isAdmin={isAdmin}
          onSuccess={() => {
            toastMessage('Announcement posted', 'success')
            onDone()
          }}
          onError={(message) => toastMessage(message, 'error')}
        />
      )}
    </Modal>
  )
}

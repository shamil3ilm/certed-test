'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EventInput } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import { CARD, cx } from '@/lib/ui'
import { useBrowserTimeZone, useMediaQuery } from '@/lib/ui/client-env'
import { requestJson } from '../api-client'
import { useUI } from '../Providers'
import { CalendarToolbar } from './CalendarToolbar'
import { CalendarComposerModal } from './CalendarComposerModal'
import { COLORS, VIEW_CONFIG, calendarDateInZone, calendarUrl, compareCalendarItems } from './calendar-config'
import { EventDetailModal } from './EventDetailModal'
import type {
  CalendarItem,
  CalendarMode,
  CalendarPayload,
  CalendarSpan,
  ComposerTab,
  EventDetail,
  Opt,
} from './calendar-types'

type FullCalendarSortEvent = {
  id?: string | number | null
  title?: string | null
  startStr?: string | null
  endStr?: string | null
  allDay?: boolean | null
  extendedProps?: {
    source?: CalendarItem['source']
    classId?: string | null
    kind?: string | null
  } | null
}

function toSortableCalendarItem(value: unknown): CalendarItem {
  const candidate = (value ?? {}) as FullCalendarSortEvent

  return {
    id: String(candidate.id ?? ''),
    source: candidate.extendedProps?.source ?? 'event',
    title: candidate.title ?? '',
    start: candidate.startStr ?? '',
    end: candidate.endStr ?? null,
    allDay: Boolean(candidate.allDay),
    classId: candidate.extendedProps?.classId ?? null,
    kind: candidate.extendedProps?.kind ?? '',
  }
}

export function CalendarView({
  canManageCalendar,
  canManageContent,
  canCreateReminder,
  classes = [],
  tutors = [],
  isAdmin = false,
}: {
  canManageCalendar: boolean
  canManageContent: boolean
  canCreateReminder: boolean
  classes?: Opt[]
  tutors?: Opt[]
  isAdmin?: boolean
}) {
  const deviceTz = useBrowserTimeZone()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const { toast } = useUI()
  const [error, setError] = useState<string | null>(null)
  const [composerState, setComposerState] = useState<{ date: string; initialTab?: ComposerTab } | null>(null)
  const [eventInfo, setEventInfo] = useState<EventDetail | null>(null)
  const [hiddenSources, setHiddenSources] = useState<ReadonlySet<CalendarItem['source']>>(new Set())
  const [mode, setMode] = useState<CalendarMode>(isMobile ? 'agenda' : 'normal')
  const [span, setSpan] = useState<CalendarSpan>(isMobile ? 'week' : 'month')
  const [currentView, setCurrentView] = useState(
    VIEW_CONFIG[isMobile ? 'agenda' : 'normal'][isMobile ? 'week' : 'month'],
  )
  const calRef = useRef<FullCalendar | null>(null)
  const hiddenRef = useRef(hiddenSources)
  const didMountRef = useRef(false)

  const canOpenComposer = canManageCalendar || canManageContent || canCreateReminder
  const resolvedView = VIEW_CONFIG[mode][span]

  useEffect(() => {
    hiddenRef.current = hiddenSources
    if (didMountRef.current) calRef.current?.getApi().refetchEvents()
    else didMountRef.current = true
  }, [hiddenSources])

  useEffect(() => {
    const api = calRef.current?.getApi()
    if (!api || api.view.type === resolvedView) return
    api.changeView(resolvedView)
  }, [resolvedView])

  const toggleSource = useCallback((source: CalendarItem['source']) => {
    setHiddenSources((current) => {
      const next = new Set(current)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
  }, [])

  const resetFilters = useCallback(() => {
    setHiddenSources(new Set())
  }, [])

  const fetchEvents = useCallback(async (info: { startStr: string; endStr: string }): Promise<EventInput[]> => {
    const from = info.startStr.slice(0, 10)
    const to = info.endStr.slice(0, 10)

    try {
      const data = await requestJson<CalendarPayload>(calendarUrl(from, to))
      setError(null)
      const hidden = hiddenRef.current
      return data.items
        .filter((item) => !hidden.has(item.source))
        .sort((a, b) => compareCalendarItems(a, b, 'soonest'))
        .map((item) => ({
          id: item.id,
          title: item.title,
          start: item.start,
          end: item.end ?? undefined,
          allDay: item.allDay,
          backgroundColor: COLORS[item.source],
          borderColor: COLORS[item.source],
          extendedProps: { source: item.source, kind: item.kind, classId: item.classId },
        }))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load calendar')
      return []
    }
  }, [])

  const openComposer = useCallback(
    (initialTab?: ComposerTab, dateOverride?: string) => {
      const date =
        dateOverride ?? calendarDateInZone(new Date(), deviceTz ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
      setComposerState({ date, initialTab })
    },
    [deviceTz],
  )

  return (
    <section className="mt-4">
      <CalendarToolbar
        canOpenComposer={canOpenComposer}
        hiddenSources={hiddenSources}
        mode={mode}
        span={span}
        currentView={currentView || resolvedView}
        deviceTz={deviceTz}
        onModeChange={setMode}
        onSpanChange={setSpan}
        onToggleSource={toggleSource}
        onResetFilters={resetFilters}
        onQuickAdd={openComposer}
      />

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className={cx(CARD, 'p-2 sm:p-3')}>
        {!deviceTz ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading calendar...</div>
        ) : (
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={resolvedView}
            timeZone={deviceTz}
            headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
            datesSet={(arg) => setCurrentView(arg.view.type)}
            buttonText={{ today: 'Today' }}
            buttonHints={{ prev: 'Previous period', next: 'Next period', today: 'This period' }}
            eventOrder={(left, right) =>
              compareCalendarItems(toSortableCalendarItem(left), toSortableCalendarItem(right), 'soonest')
            }
            dayMaxEventRows={3}
            height="auto"
            events={fetchEvents}
            dateClick={canOpenComposer ? (info) => openComposer(undefined, info.dateStr) : undefined}
            eventClick={(info) => {
              const event = info.event
              setEventInfo({
                title: event.title,
                start: event.start ? event.start.toISOString() : null,
                end: event.end ? event.end.toISOString() : null,
                allDay: event.allDay,
                source: (event.extendedProps.source as CalendarItem['source']) ?? 'event',
                kind: String(event.extendedProps.kind ?? ''),
              })
            }}
          />
        )}
      </div>

      {eventInfo && <EventDetailModal info={eventInfo} onClose={() => setEventInfo(null)} />}

      {composerState && (
        <CalendarComposerModal
          key={`${composerState.date}:${composerState.initialTab ?? 'default'}`}
          date={composerState.date}
          initialTab={composerState.initialTab}
          classes={classes}
          tutors={tutors}
          isAdmin={isAdmin}
          canManageCalendar={canManageCalendar}
          canManageContent={canManageContent}
          canCreateReminder={canCreateReminder}
          onClose={() => setComposerState(null)}
          onCalendarRefresh={() => {
            setComposerState(null)
            calRef.current?.getApi().refetchEvents()
          }}
          onDone={() => setComposerState(null)}
          toastMessage={toast}
        />
      )}
    </section>
  )
}

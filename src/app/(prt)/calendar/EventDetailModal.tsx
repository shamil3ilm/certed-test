'use client'

import Link from 'next/link'
import { Modal } from '../Modal'
import { LocalTime } from '../LocalTime'
import { CALENDAR_COLORS } from '@/lib/brand/tokens'
import { COLORS } from './calendar-config'
import type { EventDetail, Opt } from './calendar-types'
import { ExternalActionLink } from '@/lib/ui'
import { safeExternalHref } from '@/lib/validation/url'

export function EventDetailModal({
  info,
  classes = [],
  canViewGrading = false,
  onClose,
}: {
  info: EventDetail
  classes?: Opt[]
  canViewGrading?: boolean
  onClose: () => void
}) {
  const isClassSession = info.source === 'slot' && info.sessionType
  const typeLabel =
    info.source === 'slot'
      ? isClassSession
        ? `Class (${info.sessionType})`
        : 'Class'
      : info.source === 'exam' || info.kind === 'exam' || info.type === 'exam'
        ? 'Exam'
        : info.source === 'assignment' || info.kind === 'assignment'
          ? 'Assignment'
          : info.source === 'session'
            ? 'Held session'
            : info.source === 'meet'
              ? 'Meeting'
              : info.kind || 'Event'

  // Times go through LocalTime - the one timezone-aware source used everywhere -
  // rather than raw toLocale*, so an event reads the same way as every other
  // instant in the app (institute zone on the server, device zone after mount).
  const when = !info.start ? (
    '-'
  ) : info.allDay ? (
    <LocalTime iso={info.start} mode="date" />
  ) : (
    <>
      <LocalTime iso={info.start} mode="datetime" />
      {info.end && (
        <>
          {' - '}
          <LocalTime iso={info.end} mode="time" />
        </>
      )}
    </>
  )

  const className = info.classId ? (classes.find((course) => course.id === info.classId)?.name ?? null) : null
  const locationIsUrl = info.location ? safeExternalHref(info.location) : null
  const meetUrl = info.url ? safeExternalHref(info.url) : null
  const assignmentId = info.rawId ?? (info.id?.startsWith('assignment-') ? info.id.replace('assignment-', '') : null)

  const isAssessment =
    info.source === 'exam' ||
    info.source === 'assignment' ||
    info.type === 'exam' ||
    info.type === 'assignment' ||
    info.kind === 'exam' ||
    info.kind === 'assignment'

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: COLORS[info.source] ?? CALENDAR_COLORS.fallback }}
          />
          <span className="truncate">{info.title}</span>
        </span>
      }
    >
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">Type</dt>
          <dd className="capitalize text-slate-700">{typeLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-slate-600">When</dt>
          <dd className="text-right text-slate-700">{when}</dd>
        </div>
        {className && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-600">Class</dt>
            <dd className="text-right font-medium text-slate-700">{className}</dd>
          </div>
        )}
        {info.location && !locationIsUrl && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-600">Location</dt>
            <dd className="text-right text-slate-700">{info.location}</dd>
          </div>
        )}
      </dl>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
        {/* Direct external meeting links */}
        {meetUrl && (
          <ExternalActionLink href={meetUrl} className="btn-primary">
            Join Video Call
          </ExternalActionLink>
        )}

        {locationIsUrl && (
          <ExternalActionLink href={locationIsUrl} className="btn-primary">
            Join Online Class
          </ExternalActionLink>
        )}

        {/* Assessment deep links */}
        {isAssessment && info.classId && (
          <Link href={`/classroom/${info.classId}/classwork`} className="btn btn-sm btn-primary">
            Open in Classwork
          </Link>
        )}

        {isAssessment && canViewGrading && assignmentId && (
          <Link href={`/assignments/${assignmentId}`} className="btn btn-sm btn-soft">
            Grading & Submissions
          </Link>
        )}

        {/* Class session deep links */}
        {!isAssessment && info.source === 'slot' && info.classId && (
          <>
            <Link href={`/classroom/${info.classId}`} className="btn btn-sm btn-primary">
              Open Classroom
            </Link>
            <Link href={`/classroom/${info.classId}/classwork`} className="btn btn-sm btn-soft">
              Classwork
            </Link>
          </>
        )}

        {/* Meet tab link */}
        {info.source === 'meet' && info.classId && (
          <Link href={`/classroom/${info.classId}/meet`} className="btn btn-sm btn-soft">
            Class Meets
          </Link>
        )}

        {/* Attendance session deep links */}
        {info.source === 'session' && info.classId && (
          <>
            <Link href={`/classroom/${info.classId}`} className="btn btn-sm btn-primary">
              Open Classroom
            </Link>
            <Link href={`/classroom/${info.classId}/attendance`} className="btn btn-sm btn-soft">
              Attendance
            </Link>
          </>
        )}

        {/* Generic event deep link to class */}
        {info.source === 'event' && info.classId && (
          <Link href={`/classroom/${info.classId}`} className="btn btn-sm btn-soft">
            Open Classroom
          </Link>
        )}

        <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
          Close
        </button>
      </div>
    </Modal>
  )
}

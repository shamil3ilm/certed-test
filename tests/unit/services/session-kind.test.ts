import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/class-tutor-validation', () => ({ assertClassTutor: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyBestEffort: vi.fn(), notifyClassRoleBestEffort: vi.fn() }))
vi.mock('@/lib/services/attendance/session-overlap', () => ({ assertNoTutorOverlap: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({
  selectActiveTutorRowsForClass: vi.fn(),
  selectActiveClassIdsForStudent: vi.fn(),
}))
vi.mock('@/lib/data/class-sessions', () => ({
  selectSessionByIdAsService: vi.fn(),
  insertSession: vi.fn(),
  updateSessionById: vi.fn(),
  selectSessionsForDate: vi.fn(),
  selectSessionsForDateAsService: vi.fn(),
  selectSessionsByIds: vi.fn(),
  deleteSessionById: vi.fn(),
  writeStudentSessionFeedback: vi.fn(),
}))
vi.mock('@/lib/data/attendance', () => ({ studentHasAttendance: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { getProfileById } from '@/lib/services/users'
import { notifyBestEffort, notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { assertNoTutorOverlap } from '@/lib/services/attendance/session-overlap'
import { selectActiveTutorRowsForClass } from '@/lib/data/class-membership'
import { insertSession, selectSessionByIdAsService, updateSessionById } from '@/lib/data/class-sessions'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { saveSessionTimes } from '@/lib/services/attendance/sessions'

/**
 * A session's TYPE and an exam's MONITOR decide whose working time the hours are, so the rules
 * for setting them are pinned here: the defaults that keep old callers harmless, who may name
 * another person, and that a monitor can only ever sit on an exam.
 */

const TUTOR = 'a0000000-0000-4000-8000-000000000001'
const MONITOR = 'a0000000-0000-4000-8000-000000000009'
const SESSION = 'b0000000-0000-4000-8000-000000000001'
const actor = { id: TUTOR } as never
const base = { classId: 'class-1', sessionDate: '2026-08-05' }
const window = { actual_start: '2026-08-05T10:00:00Z', actual_end: '2026-08-05T11:00:00Z' }

function asRole(isAdmin: boolean, isSubAdmin = false) {
  vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin, isSubAdmin } as never)
}

function monitorProfile(over: Record<string, unknown> = {}) {
  vi.mocked(getProfileById).mockResolvedValue({ id: MONITOR, role: 'tutor', status: 'active', ...over } as never)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(canManageClass).mockResolvedValue(true)
  vi.mocked(insertSession).mockResolvedValue({ id: SESSION } as never)
  vi.mocked(updateSessionById).mockResolvedValue({ id: SESSION } as never)
  vi.mocked(selectActiveTutorRowsForClass).mockResolvedValue([{ id: 'ct1', tutor_id: TUTOR }] as never)
  asRole(false)
})

describe('saveSessionTimes - kind', () => {
  it('records a new session as regular when no kind is sent', async () => {
    await saveSessionTimes(actor, { ...base, ...window })
    expect(insertSession).toHaveBeenCalledWith(expect.objectContaining({ kind: 'regular', monitor_id: null }))
  })

  it.each(['demo', 'exam'] as const)('records a %s session', async (kind) => {
    await saveSessionTimes(actor, { ...base, ...window, kind })
    expect(insertSession).toHaveBeenCalledWith(expect.objectContaining({ kind }))
  })

  it('refuses a kind it does not know', async () => {
    await expect(saveSessionTimes(actor, { ...base, ...window, kind: 'party' })).rejects.toThrow(/session type/i)
    expect(insertSession).not.toHaveBeenCalled()
  })

  it('keeps an edited session as it was when the caller sends no kind', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue({
      id: SESSION,
      class_id: 'class-1',
      kind: 'demo',
      actual_start: null,
      actual_end: null,
      updated_at: 'u1',
    } as never)
    await saveSessionTimes(actor, { ...base, ...window, sessionId: SESSION })
    expect(updateSessionById).toHaveBeenCalledWith(SESSION, expect.objectContaining({ kind: 'demo' }), 'u1')
  })

  it('writes the kind into the audit entry, before and after', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue({
      id: SESSION,
      class_id: 'class-1',
      kind: 'regular',
      actual_start: null,
      actual_end: null,
      updated_at: 'u1',
    } as never)
    await saveSessionTimes(actor, { ...base, ...window, sessionId: SESSION, kind: 'demo' })
    const detail = vi.mocked(auditPrivilegedAction).mock.calls[0][4] as {
      before: { kind: string }
      after: { kind: string }
    }
    expect(detail.before.kind).toBe('regular')
    expect(detail.after.kind).toBe('demo')
  })
})

describe('saveSessionTimes - exam monitor', () => {
  it('records no monitor when the tutor monitored it (blank)', async () => {
    await saveSessionTimes(actor, { ...base, ...window, kind: 'exam', monitor_id: '' })
    expect(insertSession).toHaveBeenCalledWith(expect.objectContaining({ kind: 'exam', monitor_id: null }))
  })

  it('treats naming the class tutor as the tutor monitoring', async () => {
    await saveSessionTimes(actor, { ...base, ...window, kind: 'exam', monitor_id: TUTOR })
    expect(insertSession).toHaveBeenCalledWith(expect.objectContaining({ monitor_id: null }))
  })

  it('lets an admin name another person as the monitor', async () => {
    asRole(true)
    monitorProfile()
    await saveSessionTimes(actor, { ...base, ...window, kind: 'exam', monitor_id: MONITOR })
    expect(insertSession).toHaveBeenCalledWith(expect.objectContaining({ kind: 'exam', monitor_id: MONITOR }))
  })

  it('refuses a tutor naming ANOTHER person - that moves hours onto someone else`s pay', async () => {
    monitorProfile()
    await expect(saveSessionTimes(actor, { ...base, ...window, kind: 'exam', monitor_id: MONITOR })).rejects.toThrow(
      /Only a Super Admin or Admin/,
    )
    expect(insertSession).not.toHaveBeenCalled()
  })

  it('refuses someone who is NOT the session tutor naming THEMSELVES - a mentor cannot credit exam hours to themselves', async () => {
    const MENTOR = 'a0000000-0000-4000-8000-000000000007'
    monitorProfile({ id: MENTOR, role: 'mentor' })
    await expect(
      saveSessionTimes({ id: MENTOR } as never, { ...base, ...window, kind: 'exam', monitor_id: MENTOR }),
    ).rejects.toThrow(/Only a Super Admin or Admin/)
    expect(insertSession).not.toHaveBeenCalled()
  })

  it('refuses a monitor who is revoked or is not staff', async () => {
    asRole(true)
    monitorProfile({ status: 'disabled' })
    await expect(saveSessionTimes(actor, { ...base, ...window, kind: 'exam', monitor_id: MONITOR })).rejects.toThrow(
      /active tutor, mentor or admin/,
    )
    monitorProfile({ role: 'student' })
    await expect(saveSessionTimes(actor, { ...base, ...window, kind: 'exam', monitor_id: MONITOR })).rejects.toThrow(
      /active tutor, mentor or admin/,
    )
  })

  it('rejects a malformed monitor id', async () => {
    asRole(true)
    await expect(
      saveSessionTimes(actor, { ...base, ...window, kind: 'exam', monitor_id: 'not-a-uuid' }),
    ).rejects.toThrow(/Invalid monitor id/)
  })

  it.each(['regular', 'demo'] as const)('clears any monitor on a %s session', async (kind) => {
    asRole(true)
    monitorProfile()
    await saveSessionTimes(actor, { ...base, ...window, kind, monitor_id: MONITOR })
    expect(insertSession).toHaveBeenCalledWith(expect.objectContaining({ kind, monitor_id: null }))
    expect(getProfileById).not.toHaveBeenCalled()
  })

  it('leaves an edited exam`s monitor alone when the field is absent, and clears it on blank', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue({
      id: SESSION,
      class_id: 'class-1',
      kind: 'exam',
      monitor_id: MONITOR,
      actual_start: null,
      actual_end: null,
      updated_at: 'u1',
    } as never)
    await saveSessionTimes(actor, { ...base, ...window, sessionId: SESSION })
    expect(updateSessionById).toHaveBeenLastCalledWith(SESSION, expect.objectContaining({ monitor_id: MONITOR }), 'u1')

    await saveSessionTimes(actor, { ...base, ...window, sessionId: SESSION, monitor_id: '' })
    expect(updateSessionById).toHaveBeenLastCalledWith(SESSION, expect.objectContaining({ monitor_id: null }), 'u1')
  })

  it('writes the monitor into the audit entry', async () => {
    asRole(true)
    monitorProfile()
    await saveSessionTimes(actor, { ...base, ...window, kind: 'exam', monitor_id: MONITOR })
    const detail = vi.mocked(auditPrivilegedAction).mock.calls[0][4] as { after: { monitor_id: string } }
    expect(detail.after.monitor_id).toBe(MONITOR)
  })
})

describe('saveSessionTimes - telling the monitor', () => {
  it('notifies the monitor when an exam is recorded as monitored by them', async () => {
    asRole(true)
    monitorProfile()
    await saveSessionTimes(actor, { ...base, ...window, kind: 'exam', monitor_id: MONITOR })
    expect(notifyBestEffort).toHaveBeenCalledWith(
      [MONITOR],
      expect.objectContaining({ title: 'You were recorded as monitoring an exam', link: '/my-hours' }),
    )
  })

  it('does not notify when the tutor monitored it, or for any other kind', async () => {
    await saveSessionTimes(actor, { ...base, ...window, kind: 'exam', monitor_id: '' })
    await saveSessionTimes(actor, { ...base, ...window, kind: 'demo' })
    await saveSessionTimes(actor, { ...base, ...window })
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('does not tell the same monitor again when the exam is re-saved', async () => {
    asRole(true)
    monitorProfile()
    vi.mocked(selectSessionByIdAsService).mockResolvedValue({
      id: SESSION,
      class_id: 'class-1',
      kind: 'exam',
      monitor_id: MONITOR,
      actual_start: null,
      actual_end: null,
      updated_at: 'u1',
    } as never)
    await saveSessionTimes(actor, { ...base, ...window, sessionId: SESSION, monitor_id: MONITOR })
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('tells a NEW monitor when an exam is handed to someone else', async () => {
    asRole(true)
    monitorProfile({ id: 'a0000000-0000-4000-8000-00000000000a' })
    vi.mocked(selectSessionByIdAsService).mockResolvedValue({
      id: SESSION,
      class_id: 'class-1',
      kind: 'exam',
      monitor_id: MONITOR,
      actual_start: null,
      actual_end: null,
      updated_at: 'u1',
    } as never)
    const next = 'a0000000-0000-4000-8000-00000000000a'
    await saveSessionTimes(actor, { ...base, ...window, sessionId: SESSION, monitor_id: next })
    expect(notifyBestEffort).toHaveBeenCalledWith([next], expect.anything())
  })
})

describe('saveSessionTimes - telling the student about a summary', () => {
  it('tells the class student when a summary is first written, not the writer', async () => {
    await saveSessionTimes(actor, { ...base, ...window, summary: 'Covered fractions' })
    expect(notifyClassRoleBestEffort).toHaveBeenCalledWith(
      'class-1',
      'students',
      expect.objectContaining({
        title: 'A class summary was posted',
        link: '/classroom/class-1/attendance?date=2026-08-05',
      }),
      TUTOR,
    )
  })

  it('stays quiet when there is no summary', async () => {
    await saveSessionTimes(actor, { ...base, ...window, summary: '' })
    expect(notifyClassRoleBestEffort).not.toHaveBeenCalled()
  })

  it('does not tell them again when the times are re-saved with the same summary', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue({
      id: SESSION,
      class_id: 'class-1',
      kind: 'regular',
      summary: 'Covered fractions',
      actual_start: null,
      actual_end: null,
      updated_at: 'u1',
    } as never)
    await saveSessionTimes(actor, { ...base, ...window, sessionId: SESSION, summary: 'Covered fractions' })
    expect(notifyClassRoleBestEffort).not.toHaveBeenCalled()
  })

  it('tells them again when the summary changes', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue({
      id: SESSION,
      class_id: 'class-1',
      kind: 'regular',
      summary: 'Covered fractions',
      actual_start: null,
      actual_end: null,
      updated_at: 'u1',
    } as never)
    await saveSessionTimes(actor, { ...base, ...window, sessionId: SESSION, summary: 'Covered fractions and ratios' })
    expect(notifyClassRoleBestEffort).toHaveBeenCalledTimes(1)
  })
})

describe('saveSessionTimes - telling the tutor whose hours these are', () => {
  const ADMIN_ACTOR = { id: 'admin-9' } as never

  it('tells the tutor when someone else records a session for them', async () => {
    asRole(true)
    await saveSessionTimes(ADMIN_ACTOR, { ...base, ...window, tutor_id: TUTOR })
    expect(notifyBestEffort).toHaveBeenCalledWith(
      [TUTOR],
      expect.objectContaining({ title: 'A session was recorded for you', link: '/my-hours' }),
    )
  })

  it('does not tell a tutor about a session they recorded themselves', async () => {
    await saveSessionTimes(actor, { ...base, ...window })
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('tells them when the window changes, not when only the note does', async () => {
    asRole(true)
    vi.mocked(selectSessionByIdAsService).mockResolvedValue({
      id: SESSION,
      class_id: 'class-1',
      kind: 'regular',
      tutor_id: TUTOR,
      actual_start: '2026-08-05T10:00:00Z',
      actual_end: '2026-08-05T11:00:00Z',
      updated_at: 'u1',
    } as never)
    await saveSessionTimes(ADMIN_ACTOR, {
      ...base,
      ...window,
      sessionId: SESSION,
      tutor_id: TUTOR,
      summary: 'note only',
    })
    expect(notifyBestEffort).not.toHaveBeenCalled()

    await saveSessionTimes(ADMIN_ACTOR, {
      ...base,
      actual_start: '2026-08-05T10:00:00Z',
      actual_end: '2026-08-05T12:00:00Z',
      sessionId: SESSION,
      tutor_id: TUTOR,
    })
    expect(notifyBestEffort).toHaveBeenCalledWith(
      [TUTOR],
      expect.objectContaining({ title: 'A session of yours was changed' }),
    )
  })
})

describe('saveSessionTimes - the tutor double-booking check', () => {
  it('still applies to a regular session and to an exam the tutor monitored', async () => {
    await saveSessionTimes(actor, { ...base, ...window })
    await saveSessionTimes(actor, { ...base, ...window, kind: 'exam' })
    expect(assertNoTutorOverlap).toHaveBeenCalledTimes(2)
  })

  it('is skipped for an exam someone ELSE monitored: the tutor is not in the room', async () => {
    asRole(true)
    monitorProfile()
    await saveSessionTimes(actor, { ...base, ...window, kind: 'exam', monitor_id: MONITOR })
    expect(assertNoTutorOverlap).not.toHaveBeenCalled()
  })
})

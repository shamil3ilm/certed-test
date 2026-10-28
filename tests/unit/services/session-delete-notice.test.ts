import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/permission/class-write', () => ({ canWriteClass: vi.fn() }))
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

import { canWriteClass } from '@/lib/permission/class-write'
import { notifyBestEffort } from '@/lib/services/notifications'
import { selectSessionByIdAsService, deleteSessionById } from '@/lib/data/class-sessions'
import { deleteSessionTimes } from '@/lib/services/attendance/sessions'

const TUTOR = 'a0000000-0000-4000-8000-000000000001'
const MONITOR = 'a0000000-0000-4000-8000-000000000009'
const SESSION = 'b0000000-0000-4000-8000-000000000001'
const admin = { id: 'admin-9' } as never

const session = (over: Record<string, unknown> = {}) => ({
  id: SESSION,
  class_id: 'class-1',
  session_date: '2026-08-05',
  kind: 'regular',
  tutor_id: TUTOR,
  monitor_id: null,
  actual_start: '2026-08-05T10:00:00Z',
  actual_end: '2026-08-05T11:00:00Z',
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(canWriteClass).mockResolvedValue(true)
})

describe('deleteSessionTimes tells whoever the hours were', () => {
  it('tells the tutor when a class session they taught is removed', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue(session() as never)
    await deleteSessionTimes(admin, SESSION)
    expect(deleteSessionById).toHaveBeenCalledWith(SESSION)
    expect(notifyBestEffort).toHaveBeenCalledWith(
      [TUTOR],
      expect.objectContaining({ title: 'A session you worked was removed', link: '/my-hours' }),
    )
  })

  it('tells the monitor and NOT the class tutor when an exam someone else monitored is removed', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue(session({ kind: 'exam', monitor_id: MONITOR }) as never)
    await deleteSessionTimes(admin, SESSION)
    expect(notifyBestEffort).toHaveBeenCalledTimes(1)
    expect(notifyBestEffort).toHaveBeenCalledWith([MONITOR], expect.anything())
  })

  it('tells the tutor of an exam they monitored themselves', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue(session({ kind: 'exam', monitor_id: TUTOR }) as never)
    await deleteSessionTimes(admin, SESSION)
    expect(notifyBestEffort).toHaveBeenCalledWith([TUTOR], expect.anything())
  })

  it('tells nobody about a session the person removing it worked themselves', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue(session() as never)
    await deleteSessionTimes({ id: TUTOR } as never, SESSION)
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('tells nobody when the session had no worker', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue(session({ tutor_id: null }) as never)
    await deleteSessionTimes(admin, SESSION)
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })
})

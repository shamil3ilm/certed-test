import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/permission', () => ({ canWriteClass: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))

import { canWriteClass } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/repos/audit'
import { getProfileById } from '@/lib/services/users'
import { createSlot, updateSlot, deactivateSlot } from '@/lib/services/timetableSlots'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

const teacher = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
const activeTeacherProfile = { id: 'teacher-2', role: 'teacher', status: 'active' } as any
const slotRow = {
  id: 'slot-1', class_id: 'class-1', subject: 'Maths', teacher_id: null,
  day_of_week: 1, start_time: '09:00', end_time: '10:00', mode_or_location: null, active: true, created_at: 't',
}

beforeEach(() => vi.resetAllMocks())

describe('createSlot', () => {
  it('rejects a caller who cannot write to the class, without a DB write or audit', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(
      createSlot(teacher, { class_id: 'class-1', subject: 'x', day_of_week: 1, start_time: '09:00', end_time: '10:00' } as any),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('rejects a teacher_id that is not an active teacher', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce(null)
    await expect(
      createSlot(teacher, {
        class_id: 'class-1', subject: 'x', day_of_week: 1, start_time: '09:00', end_time: '10:00', teacher_id: 'foreign-id',
      } as any),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('creates and audits timetable.create', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    const created = await createSlot(teacher, { class_id: 'class-1', subject: 'Maths', day_of_week: 1, start_time: '09:00', end_time: '10:00' } as any)
    expect(created.id).toBe('slot-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'timetable.create', entity_type: 'timetable_slot', entity_id: 'slot-1',
    })
  })
})

describe('updateSlot', () => {
  it('throws NotFoundError for a missing id, without a permission check', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(updateSlot(teacher, 'missing', {} as any)).rejects.toBeInstanceOf(NotFoundError)
    expect(canWriteClass).not.toHaveBeenCalled()
  })

  it('rejects a non-manager of the slot\'s class, without writing/auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(updateSlot(teacher, 'slot-1', { subject: 'New' } as any)).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('audits timetable.reassign when teacher_id is set, timetable.update otherwise', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce(activeTeacherProfile)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: { ...slotRow, teacher_id: 'teacher-2' }, error: null }) as any)
    await updateSlot(teacher, 'slot-1', { teacher_id: 'teacher-2' } as any)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'timetable.reassign', entity_type: 'timetable_slot', entity_id: 'slot-1',
    })

    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    await updateSlot(teacher, 'slot-1', { subject: 'New subject' } as any)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'timetable.update', entity_type: 'timetable_slot', entity_id: 'slot-1',
    })
  })
})

describe('deactivateSlot', () => {
  it('throws NotFoundError for a missing id', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(deactivateSlot(teacher, 'missing')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('deactivates and audits ONLY timetable.deactivate (not also timetable.update)', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: { ...slotRow, active: false }, error: null }) as any)
    await deactivateSlot(teacher, 'slot-1')
    expect(writeAudit).toHaveBeenCalledTimes(1)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'timetable.deactivate', entity_type: 'timetable_slot', entity_id: 'slot-1',
    })
  })
})

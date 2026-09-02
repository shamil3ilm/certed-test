import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canMentor: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/data/personas', () => ({ selectMentorAssignedAt: vi.fn() }))
vi.mock('@/lib/data/mentee-notes', () => ({ insertMenteeNote: vi.fn(), selectMenteeNotesByStudent: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { canMentor } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { selectMentorAssignedAt } from '@/lib/data/personas'
import { insertMenteeNote, selectMenteeNotesByStudent } from '@/lib/data/mentee-notes'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { addMenteeNote, listMenteeNotes } from '@/lib/services/mentee-notes'
import { PermissionError, ValidationError } from '@/lib/errors'

const actor = { id: 'm1' } as never
const asAdmin = () => vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true } as never)
const asMentor = () => vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false } as never)

beforeEach(() => vi.resetAllMocks())

describe('mentee notes (pastoral)', () => {
  it('admin sees the full history and the view is audited (N-05)', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    asAdmin()
    vi.mocked(selectMenteeNotesByStudent).mockResolvedValue([
      { id: 'n1', author_id: 'x', created_at: '2020-01-01' },
    ] as never)
    expect(await listMenteeNotes(actor, 's1')).toEqual([{ id: 'n1', author_id: 'x', created_at: '2020-01-01' }])
    expect(selectMentorAssignedAt).not.toHaveBeenCalled()
    expect(auditPrivilegedAction).toHaveBeenCalledWith(actor, 'mentee.note_view', 'profile', 's1')
  })

  it('does NOT audit a view that discloses nothing (empty result)', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    asAdmin()
    vi.mocked(selectMenteeNotesByStudent).mockResolvedValue([] as never)
    expect(await listMenteeNotes(actor, 's1')).toEqual([])
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('minimises a mentor to their own tenure + their own notes (N-03)', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    asMentor()
    vi.mocked(selectMentorAssignedAt).mockResolvedValue('2026-06-01T00:00:00.000Z')
    vi.mocked(selectMenteeNotesByStudent).mockResolvedValue([
      { id: 'other-old', author_id: 'prev', created_at: '2026-05-01T00:00:00.000Z' }, // before tenure, other author -> hidden
      { id: 'mine-old', author_id: 'm1', created_at: '2026-05-15T00:00:00.000Z' }, // before tenure but own -> shown
      { id: 'after', author_id: 'prev', created_at: '2026-07-01T00:00:00.000Z' }, // during tenure -> shown
    ] as never)
    const result = await listMenteeNotes(actor, 's1')
    expect(result.map((n) => n.id)).toEqual(['mine-old', 'after'])
  })

  it('fail-closed: a non-admin with no resolved mentorship start sees only their own notes', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    asMentor()
    vi.mocked(selectMentorAssignedAt).mockResolvedValue(null)
    vi.mocked(selectMenteeNotesByStudent).mockResolvedValue([
      { id: 'a', author_id: 'prev', created_at: '2026-07-01T00:00:00.000Z' },
      { id: 'b', author_id: 'm1', created_at: '2026-07-02T00:00:00.000Z' },
    ] as never)
    expect((await listMenteeNotes(actor, 's1')).map((n) => n.id)).toEqual(['b'])
  })

  it('refuses to list for someone who does not mentor the student', async () => {
    vi.mocked(canMentor).mockResolvedValue(false)
    await expect(listMenteeNotes(actor, 's1')).rejects.toBeInstanceOf(PermissionError)
    expect(selectMenteeNotesByStudent).not.toHaveBeenCalled()
  })

  it('adds a trimmed note authored by the actor when allowed', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    await addMenteeNote(actor, 's1', '  Watch attendance  ')
    expect(insertMenteeNote).toHaveBeenCalledWith('s1', 'm1', 'Watch attendance')
  })

  it('rejects an empty note', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    await expect(addMenteeNote(actor, 's1', '   ')).rejects.toBeInstanceOf(ValidationError)
    expect(insertMenteeNote).not.toHaveBeenCalled()
  })

  it('refuses to add for a non-mentor, and audits the denied attempt (N-12)', async () => {
    vi.mocked(canMentor).mockResolvedValue(false)
    await expect(addMenteeNote(actor, 's1', 'x')).rejects.toBeInstanceOf(PermissionError)
    expect(insertMenteeNote).not.toHaveBeenCalled()
    expect(auditPrivilegedAction).toHaveBeenCalledWith(actor, 'mentee.note_add_denied', 'profile', 's1')
  })
})

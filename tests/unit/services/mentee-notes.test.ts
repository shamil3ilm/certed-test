import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canMentor: vi.fn() }))
vi.mock('@/lib/data/mentee-notes', () => ({ insertMenteeNote: vi.fn(), selectMenteeNotesByStudent: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { canMentor } from '@/lib/permission'
import { insertMenteeNote, selectMenteeNotesByStudent } from '@/lib/data/mentee-notes'
import { addMenteeNote, listMenteeNotes } from '@/lib/services/mentee-notes'
import { PermissionError, ValidationError } from '@/lib/errors'

const actor = { id: 'm1' } as never

beforeEach(() => vi.resetAllMocks())

describe('mentee notes (pastoral)', () => {
  it('lists notes when the actor mentors the student', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    vi.mocked(selectMenteeNotesByStudent).mockResolvedValue([{ id: 'n1' }] as never)
    expect(await listMenteeNotes(actor, 's1')).toEqual([{ id: 'n1' }])
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

  it('refuses to add for a non-mentor', async () => {
    vi.mocked(canMentor).mockResolvedValue(false)
    await expect(addMenteeNote(actor, 's1', 'x')).rejects.toBeInstanceOf(PermissionError)
    expect(insertMenteeNote).not.toHaveBeenCalled()
  })
})

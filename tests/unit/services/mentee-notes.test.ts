import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canMentor: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/data/personas', () => ({ selectMentorAssignedAt: vi.fn() }))
vi.mock('@/lib/data/mentee-notes', () => ({ insertMenteeNote: vi.fn(), selectMenteeNotePage: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { canMentor } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { selectMentorAssignedAt } from '@/lib/data/personas'
import { insertMenteeNote, selectMenteeNotePage } from '@/lib/data/mentee-notes'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { addMenteeNote, listMenteeNotes } from '@/lib/services/mentee-notes'
import { PermissionError, ValidationError } from '@/lib/errors'

const actor = { id: 'm1' } as never
// Full-history access here is decided by `isAdmin` alone - NOT the shared
// isMentoringOversight predicate the class-scoped mentoring surfaces use. mentee_notes_read
// gates on is_active_admin(), so this service must not disclose more than RLS would.
// hasMentorAuthority is still set on every fixture because the minimisation branch reads it.
const asAdmin = () =>
  vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true, hasMentorAuthority: false } as never)
// A sub-admin: holds viewMentees, mentors nobody. Oversight on the class-scoped pages,
// but NOT here - see the sub-admin test below for why the asymmetry is deliberate.
const asSubAdmin = () =>
  vi
    .mocked(loadPersonaFlags)
    .mockResolvedValue({ isAdmin: false, isSubAdmin: true, hasMentorAuthority: false } as never)
const asMentor = () =>
  vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false, hasMentorAuthority: true } as never)

beforeEach(() => vi.resetAllMocks())

describe('mentee notes (pastoral)', () => {
  const PAGE = { page: 1, pageSize: 20 }
  const page = (items: unknown[], total = items.length) => ({ items, total }) as never

  it('admin sees the full history - no visibility rule is imposed', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    asAdmin()
    vi.mocked(selectMenteeNotePage).mockResolvedValue(page([{ id: 'n1', author_id: 'x', created_at: '2020-01-01' }]))
    const result = await listMenteeNotes(actor, 's1', PAGE)
    expect(result.items).toEqual([{ id: 'n1', author_id: 'x', created_at: '2020-01-01' }])
    expect(selectMentorAssignedAt).not.toHaveBeenCalled()
    // Third argument undefined = no narrowing, which is what "full history" means now that
    // the rule lives in the query rather than in a pass over the fetched rows.
    expect(vi.mocked(selectMenteeNotePage).mock.calls[0][2]).toBeUndefined()
    expect(auditPrivilegedAction).toHaveBeenCalledWith(actor, 'mentee.note_view', 'profile', 's1')
  })

  it('a SUB-ADMIN does NOT get the full history - the app must not be looser than RLS', async () => {
    // Deliberate, and the opposite of the other mentoring surfaces. /students and the
    // session-times list widened to sub_admin because 0092 widened teaches_class() in RLS
    // to match. mentee_notes_read gates on is_active_admin(), which 0092 did NOT widen, so
    // granting it here would make this service-role read disclose rows the database would
    // refuse. Widening it is a DPDP decision about a minor's pastoral history and needs a
    // migration, not a predicate swap - this test is what makes that explicit.
    vi.mocked(canMentor).mockResolvedValue(true)
    asSubAdmin()
    vi.mocked(selectMentorAssignedAt).mockResolvedValue(null as never)
    vi.mocked(selectMenteeNotePage).mockResolvedValue(page([]))

    await listMenteeNotes(actor, 's1', PAGE)
    // Narrowed like any other non-admin: their own notes only, since no tenure resolves.
    expect(vi.mocked(selectMenteeNotePage).mock.calls[0][2]).toEqual({ authorId: 'm1', since: null })
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('does NOT audit a view that discloses nothing (empty result)', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    asAdmin()
    vi.mocked(selectMenteeNotePage).mockResolvedValue(page([]))
    expect((await listMenteeNotes(actor, 's1', PAGE)).items).toEqual([])
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('minimises a mentor to their own tenure + their own notes, IN THE QUERY', async () => {
    // The rule has to reach the database now that the list is paged: applied to fetched
    // rows instead, the COUNT would describe the full history while the rows described the
    // visible subset, so the pager would offer pages of a previous mentor's observations.
    vi.mocked(canMentor).mockResolvedValue(true)
    asMentor()
    vi.mocked(selectMentorAssignedAt).mockResolvedValue('2026-06-01T00:00:00.000Z')
    vi.mocked(selectMenteeNotePage).mockResolvedValue(page([{ id: 'after', author_id: 'prev' }]))
    await listMenteeNotes(actor, 's1', PAGE)
    expect(vi.mocked(selectMenteeNotePage).mock.calls[0][2]).toEqual({
      authorId: 'm1',
      since: '2026-06-01T00:00:00.000Z',
    })
  })

  it('fail-closed: a non-admin with no resolved mentorship start is narrowed to their own notes', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    asMentor()
    vi.mocked(selectMentorAssignedAt).mockResolvedValue(null)
    vi.mocked(selectMenteeNotePage).mockResolvedValue(page([]))
    await listMenteeNotes(actor, 's1', PAGE)
    expect(vi.mocked(selectMenteeNotePage).mock.calls[0][2]).toEqual({ authorId: 'm1', since: null })
  })

  it('reports the QUERY total, so the pager counts the notes this reader may see', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    asAdmin()
    vi.mocked(selectMenteeNotePage).mockResolvedValue(page([{ id: 'n1' }], 137))
    await expect(listMenteeNotes(actor, 's1', PAGE)).resolves.toMatchObject({ total: 137 })
  })

  it('asks for the requested page rather than always the first', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    asAdmin()
    vi.mocked(selectMenteeNotePage).mockResolvedValue(page([]))
    await listMenteeNotes(actor, 's1', { page: 3, pageSize: 20 })
    expect(vi.mocked(selectMenteeNotePage).mock.calls[0][1]).toEqual({ from: 40, to: 59 })
  })

  it('refuses to list for someone who does not mentor the student', async () => {
    vi.mocked(canMentor).mockResolvedValue(false)
    await expect(listMenteeNotes(actor, 's1', PAGE)).rejects.toBeInstanceOf(PermissionError)
    expect(selectMenteeNotePage).not.toHaveBeenCalled()
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

  it('refuses to add for a non-mentor, and audits the denied attempt', async () => {
    vi.mocked(canMentor).mockResolvedValue(false)
    await expect(addMenteeNote(actor, 's1', 'x')).rejects.toBeInstanceOf(PermissionError)
    expect(insertMenteeNote).not.toHaveBeenCalled()
    expect(auditPrivilegedAction).toHaveBeenCalledWith(actor, 'mentee.note_add_denied', 'profile', 's1')
  })
})

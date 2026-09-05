import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/auth/class-scope', () => ({ teachesClassWrite: vi.fn(), teachesClass: vi.fn() }))

import { loadPersonaFlags } from '@/lib/permission/personas'
import { teachesClassWrite } from '@/lib/auth/class-scope'
import { canWriteClass } from '@/lib/permission/class-write'

const profile = { id: 'p1' } as never

beforeEach(() => vi.resetAllMocks())

describe('canWriteClass - mirrors teaches_class_write (tutor-only WRITE scope)', () => {
  it('admin may write anything, without consulting the class scope', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true } as never)
    expect(await canWriteClass(profile, 'class-1')).toBe(true)
    expect(await canWriteClass(profile, null)).toBe(true)
    expect(teachesClassWrite).not.toHaveBeenCalled()
  })

  it('a sub_admin may write any class, matching 0092 teaches_class_write', async () => {
    // sub_admin manages classes academy-wide. The guard requires the PERSONA (because the
    // widened RLS function checks it too, so a capability-only gate could be looser than
    // the DB and turn a write into a 500) AND the resolved capability (so a deny override
    // actually strips the authority - C-09).
    vi.mocked(loadPersonaFlags).mockResolvedValue({
      isAdmin: false,
      isSubAdmin: true,
      isClassAdmin: true,
    } as never)
    expect(await canWriteClass(profile, 'class-sub-admin')).toBe(true)
    expect(teachesClassWrite).not.toHaveBeenCalled()
  })

  it('a sub_admin with a DENY override on manageClasses falls back to the tutor scope (C-09)', async () => {
    // The override must remove real authority, not merely grey out the UI while the write
    // still lands. Falling through to teaches_class_write is the fail-closed direction.
    vi.mocked(loadPersonaFlags).mockResolvedValue({
      isAdmin: false,
      isSubAdmin: true,
      isClassAdmin: false,
    } as never)
    vi.mocked(teachesClassWrite).mockResolvedValue(false)
    expect(await canWriteClass(profile, 'class-sub-admin')).toBe(false)
    expect(teachesClassWrite).toHaveBeenCalledWith('class-sub-admin')
  })

  it('a sub_admin still cannot make a GLOBAL (null class) write', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false, isSubAdmin: true, isClassAdmin: true } as never)
    expect(await canWriteClass(profile, null)).toBe(false)
  })

  it('a non-admin global (null class) write is refused', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false } as never)
    expect(await canWriteClass(profile, null)).toBe(false)
    expect(teachesClassWrite).not.toHaveBeenCalled()
  })

  it('a tutor of the class may write (teaches_class_write true)', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false } as never)
    vi.mocked(teachesClassWrite).mockResolvedValue(true)
    expect(await canWriteClass(profile, 'class-1')).toBe(true)
    expect(teachesClassWrite).toHaveBeenCalledWith('class-1')
  })

  it('a mentor of an enrolled student is NOT granted write (teaches_class_write drops the mentor branch)', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false } as never)
    // teaches_class_write excludes mentors, so the RPC returns false for one - a clean
    // denial here, not a looser app grant that would then 500 against RLS.
    vi.mocked(teachesClassWrite).mockResolvedValue(false)
    expect(await canWriteClass(profile, 'class-1')).toBe(false)
  })
})

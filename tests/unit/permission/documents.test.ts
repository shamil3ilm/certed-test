import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/permission/class', () => ({ canAccessClass: vi.fn() }))
vi.mock('@/lib/permission/class-write', () => ({ canWriteClass: vi.fn() }))

import { loadPersonaFlags } from '@/lib/permission/personas'
import { canAccessClass } from '@/lib/permission/class'
import { canWriteClass } from '@/lib/permission/class-write'
import { canDocument, documentRoleFor } from '@/lib/permission/documents'

const FLAGS = (
  o: Partial<Record<'isAdmin' | 'isSubAdmin' | 'isTutor' | 'isMentor' | 'hasMentorAuthority' | 'isStudent', boolean>>,
) =>
  ({
    isAdmin: false,
    isSubAdmin: false,
    isTutor: false,
    isMentor: false,
    hasMentorAuthority: false,
    isStudent: false,
    ...o,
  }) as any

const actor = { id: 'u-1' } as any
const doc = { class_id: 'c-1', uploaded_by: 'u-1', visibility: 'class' as const }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(canWriteClass).mockResolvedValue(true)
  vi.mocked(canAccessClass).mockResolvedValue(true)
})

describe('documentRoleFor - role resolution (mentoring never upgrades a tutor)', () => {
  it('resolves admin > tutor > mentor > student, keying the mentor row on the dedicated identity', () => {
    expect(documentRoleFor(FLAGS({ isAdmin: true, isTutor: true }))).toBe('admin')
    // A tutor who ALSO mentors a student (hasMentorAuthority) stays a tutor (edit:'own');
    // mentoring must not promote them to the mentor row's 'yes' scope.
    expect(documentRoleFor(FLAGS({ isTutor: true, hasMentorAuthority: true }))).toBe('tutor')
    // A DEDICATED mentor (global mentor identity, not a tutor) gets the mentor row.
    expect(documentRoleFor(FLAGS({ isMentor: true, hasMentorAuthority: true }))).toBe('mentor')
    expect(documentRoleFor(FLAGS({ isTutor: true }))).toBe('tutor')
    expect(documentRoleFor(FLAGS({ isStudent: true }))).toBe('student')
    // A sub_admin manages class content academy-wide, so it takes the full-control row
    // rather than falling through to 'student' (which would deny it every write AND hide
    // staff-only documents from it).
    expect(documentRoleFor(FLAGS({ isSubAdmin: true }))).toBe('admin')
  })
})

describe('canDocument - student', () => {
  beforeEach(() => vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isStudent: true })))

  it('may view and download a class-visible document', async () => {
    expect(await canDocument(actor, 'view', doc)).toBe(true)
    expect(await canDocument(actor, 'download', doc)).toBe(true)
  })

  it('may NOT upload, edit, delete, or share', async () => {
    for (const action of ['upload', 'edit', 'delete', 'share'] as const) {
      expect(await canDocument(actor, action, doc)).toBe(false)
    }
    // A denied matrix entry short-circuits before any class-scope query.
    expect(canWriteClass).not.toHaveBeenCalled()
  })

  it('may NOT view or download a staff-only document', async () => {
    const staffDoc = { ...doc, visibility: 'staff' as const }
    expect(await canDocument(actor, 'view', staffDoc)).toBe(false)
    expect(await canDocument(actor, 'download', staffDoc)).toBe(false)
  })
})

describe('canDocument - tutor (own-only edit/delete)', () => {
  beforeEach(() => vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isTutor: true })))

  it('may upload to a class they manage', async () => {
    expect(await canDocument(actor, 'upload', doc)).toBe(true)
  })

  it('may edit/delete only what they uploaded', async () => {
    expect(await canDocument(actor, 'edit', { ...doc, uploaded_by: 'u-1' })).toBe(true)
    expect(await canDocument(actor, 'delete', { ...doc, uploaded_by: 'u-1' })).toBe(true)
    expect(await canDocument(actor, 'edit', { ...doc, uploaded_by: 'other' })).toBe(false)
    expect(await canDocument(actor, 'delete', { ...doc, uploaded_by: 'other' })).toBe(false)
  })

  it('is denied any manage action outside their class scope', async () => {
    vi.mocked(canWriteClass).mockResolvedValue(false)
    expect(await canDocument(actor, 'upload', doc)).toBe(false)
    expect(await canDocument(actor, 'edit', doc)).toBe(false)
  })

  it('gates writes on the tutor-only write scope, not the broader manage scope', async () => {
    // A tutor who ALSO mentors gets canManageClass on a mentee's class they do not teach,
    // but the content RLS policies are tutor-only (teaches_class_write). Gating on the
    // write scope denies cleanly here instead of passing the app guard and hitting an RLS
    // refusal as a raw 500.
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isTutor: true, hasMentorAuthority: true }))
    vi.mocked(canWriteClass).mockResolvedValue(false)
    expect(await canDocument(actor, 'upload', doc)).toBe(false)
    expect(canWriteClass).toHaveBeenCalledWith(actor, doc.class_id)
  })
})

describe('canDocument - mentor: read-only pastoral oversight', () => {
  beforeEach(() => vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isMentor: true, hasMentorAuthority: true })))

  it('may view/download a mentee class document', async () => {
    const other = { ...doc, uploaded_by: 'a-tutor' }
    expect(await canDocument(actor, 'view', other)).toBe(true)
    expect(await canDocument(actor, 'download', other)).toBe(true)
  })

  it('may NOT author content - upload/edit/delete/share are refused', async () => {
    const other = { ...doc, uploaded_by: 'a-tutor' }
    for (const action of ['upload', 'edit', 'delete', 'share'] as const) {
      expect(await canDocument(actor, action, other)).toBe(false)
    }
    // A denied matrix entry short-circuits before any class-scope query - a mentor
    // holds no manageClassContent, so authoring never reaches the scope check.
    expect(canWriteClass).not.toHaveBeenCalled()
  })
})

describe('canDocument - admin has full control', () => {
  beforeEach(() => vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isAdmin: true })))

  it('may perform every action', async () => {
    for (const action of ['view', 'upload', 'edit', 'delete', 'download', 'share'] as const) {
      expect(await canDocument(actor, action, { ...doc, uploaded_by: 'someone-else' })).toBe(true)
    }
  })
})

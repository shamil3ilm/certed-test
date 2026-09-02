import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/permission/class', () => ({ canManageClass: vi.fn(), canAccessClass: vi.fn() }))

import { loadPersonaFlags } from '@/lib/permission/personas'
import { canManageClass, canAccessClass } from '@/lib/permission/class'
import { canDocument, documentRoleFor } from '@/lib/permission/documents'

const FLAGS = (o: Partial<Record<'isAdmin' | 'isTutor' | 'isMentor' | 'hasMentorAuthority' | 'isStudent', boolean>>) =>
  ({ isAdmin: false, isTutor: false, isMentor: false, hasMentorAuthority: false, isStudent: false, ...o }) as any

const actor = { id: 'u-1' } as any
const doc = { class_id: 'c-1', uploaded_by: 'u-1', visibility: 'class' as const }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(canManageClass).mockResolvedValue(true)
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
    expect(canManageClass).not.toHaveBeenCalled()
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
    vi.mocked(canManageClass).mockResolvedValue(false)
    expect(await canDocument(actor, 'upload', doc)).toBe(false)
    expect(await canDocument(actor, 'edit', doc)).toBe(false)
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
    expect(canManageClass).not.toHaveBeenCalled()
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

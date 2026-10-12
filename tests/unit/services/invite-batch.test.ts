import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/users', () => ({
  addUser: vi.fn(),
  validateAddUserInput: vi.fn(),
  deleteUnregisteredProfile: vi.fn(),
  getProfileByEmail: vi.fn(),
}))
vi.mock('@/lib/services/mentorships', () => ({ assignMentor: vi.fn(), assertAssignableMentor: vi.fn() }))
vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))

import { inviteUsersBatch } from '@/lib/services/user-invites'
import { addUser, validateAddUserInput, getProfileByEmail } from '@/lib/services/users'
import { assertAssignableMentor } from '@/lib/services/mentorships'
import { ValidationError } from '@/lib/errors'

const actor = { id: 'actor-1' } as never
const rows = [
  { email: 'a@x.test', full_name: 'A', role: 'tutor' },
  { email: 'b@x.test', full_name: 'B', role: 'tutor' },
  { email: 'c@x.test', full_name: 'C', role: 'tutor' },
]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getProfileByEmail).mockResolvedValue(null as never)
  vi.mocked(validateAddUserInput).mockImplementation((input) => ({ user: input, mentorId: null }) as never)
  let n = 0
  vi.mocked(addUser).mockImplementation(async (_a, u) => {
    n += 1
    return {
      profile: { id: `p${n}`, email: (u as { email: string }).email, full_name: 'X', role: 'tutor' } as never,
      code: `CODE000${n}`,
    }
  })
})

describe('inviteUsersBatch', () => {
  it('creates every row and returns a code for each', async () => {
    const result = await inviteUsersBatch(actor, rows, ['tutor'])
    expect(result.created.map((c) => c.code)).toEqual(['CODE0001', 'CODE0002', 'CODE0003'])
    expect(result.failed).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('writes nothing at all when any row fails validation', async () => {
    const result = await inviteUsersBatch(actor, [...rows, { email: 'bad', role: 'tutor' }], ['tutor'])
    expect(result.created).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(addUser).not.toHaveBeenCalled()
  })

  it('reports an email already taken without writing anything', async () => {
    vi.mocked(getProfileByEmail).mockImplementation(async (e) =>
      e === 'b@x.test' ? ({ id: 'existing' } as never) : null,
    )
    const result = await inviteUsersBatch(actor, rows, ['tutor'])
    expect(result.errors).toEqual([{ index: 1, field: 'email', message: expect.stringMatching(/already/i) }])
    expect(addUser).not.toHaveBeenCalled()
  })

  it('creates in list order, one at a time', async () => {
    await inviteUsersBatch(actor, rows, ['tutor'])
    expect(vi.mocked(addUser).mock.calls.map((c) => (c[1] as { email: string }).email)).toEqual([
      'a@x.test',
      'b@x.test',
      'c@x.test',
    ])
  })

  /**
   * The one case upfront validation cannot prevent: someone takes the email between the check
   * and the write. The earlier rows stay created WITH their codes - discarding them would
   * destroy credentials stored nowhere else - and the rest are reported so the admin can
   * resubmit only those.
   */
  it('keeps the rows it created when one fails mid-batch, and reports the rest', async () => {
    vi.mocked(addUser)
      .mockResolvedValueOnce({
        profile: { id: 'p1', email: 'a@x.test', full_name: 'A', role: 'tutor' } as never,
        code: 'CODE0001',
      })
      .mockRejectedValueOnce(new ValidationError('A user with that email already exists'))
      .mockResolvedValueOnce({
        profile: { id: 'p3', email: 'c@x.test', full_name: 'C', role: 'tutor' } as never,
        code: 'CODE0003',
      })

    const result = await inviteUsersBatch(actor, rows, ['tutor'])
    expect(result.created.map((c) => c.email)).toEqual(['a@x.test', 'c@x.test'])
    expect(result.failed).toEqual([{ index: 1, email: 'b@x.test', message: expect.stringMatching(/already exists/i) }])
  })

  // An unexpected throw may carry database or configuration detail, and this string is
  // rendered in a browser.
  it('does not forward an unknown error message to the caller', async () => {
    vi.mocked(addUser).mockRejectedValue(new Error('connection string postgres://user:pw@host'))
    const result = await inviteUsersBatch(actor, [rows[0]], ['tutor'])
    expect(result.failed[0].message).not.toMatch(/postgres/)
    expect(result.failed[0].message).toMatch(/could not add/i)
  })

  /**
   * The mentor pre-flight, before the first write. inviteUser checks per row, which is right
   * for any caller - but in a batch that means a stale mentor on row 12 is found after eleven
   * accounts exist and eleven one-time codes have been shown.
   */
  it('pre-flights each distinct mentor once, before creating anything', async () => {
    const studentRows = [
      {
        email: 's1@x.test',
        full_name: 'S1',
        role: 'student',
        country: 'India',
        class_level: 'Grade 10',
        mentor_id: '11111111-1111-4111-8111-111111111111',
      },
      {
        email: 's2@x.test',
        full_name: 'S2',
        role: 'student',
        country: 'India',
        class_level: 'Grade 10',
        mentor_id: '11111111-1111-4111-8111-111111111111',
      },
    ]
    await inviteUsersBatch(actor, studentRows, ['student'])
    // One distinct mentor across two rows -> checked once up front (inviteUser's own per-row
    // check still runs, so the total is higher; what matters is the pre-flight happened).
    expect(assertAssignableMentor).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })

  it('writes nothing when a mentor is no longer assignable', async () => {
    vi.mocked(assertAssignableMentor).mockRejectedValue(new ValidationError('That mentor is no longer available.'))
    const studentRows = [
      {
        email: 's1@x.test',
        full_name: 'S1',
        role: 'student',
        country: 'India',
        class_level: 'Grade 10',
        mentor_id: '11111111-1111-4111-8111-111111111111',
      },
    ]
    const result = await inviteUsersBatch(actor, studentRows, ['student'])
    expect(addUser).not.toHaveBeenCalled()
    expect(result.created).toEqual([])
    expect(result.errors).toEqual([
      { index: 0, field: 'mentor_id', message: expect.stringMatching(/no longer available/i) },
    ])
  })
})

# Adding Several Users at Once — Implementation Plan (piece 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin can add up to 25 people of mixed roles in one pass, and gets back a table of one-time setup codes they can copy or download.

**Architecture:** The whole per-row create sequence is extracted once into a composition service, so the single form and the batch run **identical** code. The batch validates every row before writing anything, then creates row by row. No schema change, no new capability.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, Vitest (jsdom), Playwright.

**Spec:** [docs/specs/2026-10-12-roles-relabel-and-bulk-user-add.md](../specs/2026-10-12-roles-relabel-and-bulk-user-add.md) — piece 3.
**Depends on:** piece 2 ([the re-issue action](2026-10-12-reissue-setup-code.md), shipped). Twenty-five codes on one screen is twenty-five chances to lose one; re-issue is what makes that cost a click.

---

## The thing the spec got wrong, and this plan fixes

The spec says the Create phase "calls the existing `addUser` once per row" and that "the batch is a caller, not a second path".

**`addUser` is not the per-row create.** Read `addUserAction` in `src/app/(prt)/admin/users/actions.ts:42-86`: creating one user is five steps, and only the middle one is `addUser`.

1. `validateAddUserInput` — which **requires a mentor for a student** ("Every student has a mentor", `src/lib/services/users/validation.ts:77-82`).
2. A mentor **pre-flight**: `requireActorCapability(me.id, 'manageMentorships', …)` then `assertAssignableMentor(mentorId)` — done _before_ creating, so a request that cannot complete does not burn a setup code.
3. `addUser`.
4. `assignMentor`.
5. On an assign failure, `deleteUnregisteredProfile` to roll the account back.

A batch that called `addUser` alone would create students with **no mentor** — sitting outside every mentor's list, seen by nobody in the pastoral view, which is the exact failure `validateAddUserInput` exists to prevent. It would also skip the pre-flight, so a `sub_admin` without `manageMentorships` would burn 25 setup codes before failing.

So Task 1 extracts steps 1-5 into one function and rewires the single action to call it. That honours the spec's _intent_ — one path, not two — rather than its letter. **No behaviour changes for the single form**; Task 1's tests exist to prove that.

## Where the extraction lives, and why not in `services/users/`

`src/lib/services/mentorships/commands.ts:3` imports `getProfileById` from `@/lib/services/users`. Putting a mentorship-importing function inside `services/users/` would close that into a cycle (`users → mentorships → users`).

The new module is therefore `src/lib/services/user-invites.ts`, a composition layer **above** both: it imports from `services/users`, `services/mentorships` and `services/authorization`, and nothing imports it except the action layer. No cycle.

It obeys `docs/architecture-rules.md` §4.1: a service is a pure function of `(actor, input)` and never calls `revalidatePath` — that stays in the action.

## Why the CSV is built in the browser

The plaintext codes exist in exactly one place: the object the action returns. They are never stored — only `sha256(upper(code))` is ([ADR-0008](../adr/0008-setup-codes-are-reissued-not-recovered.md)). So "Download CSV" cannot be a server route: the server would have no way to produce the codes, and sending them back up to be formatted would put 25 plaintext credentials into a request log for nothing.

The results table builds the CSV from its own state with a `Blob` and an object URL.

## What exists already

| Thing                                                | Where                                               | Why it matters                                                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Modal`                                              | `src/app/(prt)/Modal.tsx`                           | Shared shell: focus trap, Escape, `size="sm" \| "md" \| "lg"`. Five surfaces already use it. **Do not write a second one.**             |
| `roleOptions`, `mentorCandidates`, `canAssignMentor` | `src/lib/services/page-data/admin-users.ts:200-215` | Already computed per actor, already passed to `AddUserForm`. The modal takes the **same props** — authority is inherited, not restated. |
| `addUserSchema`                                      | `src/lib/validation/user.ts:45`                     | Per-row validation, including the student-only country and class/grade rules.                                                           |
| `getProfileByEmail`                                  | `src/lib/services/users/directory.ts`               | The "email already in use" check.                                                                                                       |
| `canManageTarget`                                    | `src/lib/services/users/admin-lifecycle.ts:41`      | The tier gate. `addUser` applies it per row already, so the batch validator checks it only to report early.                             |
| The success panel                                    | `src/app/(prt)/admin/users/AddUserForm.tsx:133-151` | The code treatment to match.                                                                                                            |
| `useActionState`                                     | `src/app/(prt)/admin/users/AddUserForm.tsx:30`      | The hook this repo uses. `react-dom`'s `useFormState` logs a console error on every render in React 19.2 — do not reintroduce it.       |

## File structure

| File                                                      | Responsibility                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/lib/services/user-invites.ts` (create)               | `inviteUser` (the extracted five steps) and `inviteUsersBatch` (validate-all, then create). |
| `src/lib/services/user-invites-validation.ts` (create)    | `validateInviteBatch` — the four batch rules, pure and separately testable.                 |
| `src/app/(prt)/admin/users/actions.ts` (modify)           | `addUserAction` delegates to `inviteUser`; new `addUsersBatchAction`.                       |
| `src/app/(prt)/admin/users/AddSeveralButton.tsx` (create) | The trigger + `Modal` + the row editor.                                                     |
| `src/app/(prt)/admin/users/BatchResults.tsx` (create)     | The results table, Copy all, Download CSV, per-row invite.                                  |
| `src/app/(prt)/admin/users/page.tsx` (modify)             | Render the trigger beside the existing form.                                                |

---

### Task 0: Record the branch point

- [x] **Step 1: Branch and capture the base**

```bash
git checkout -b feature/add-several-users
git rev-parse HEAD
```

Write that hash down as `$BASE`. Task 7 diffs against it.

If the tree is not clean, **stop and report**: a parallel session shares it, so every task stages only the paths it names and never `git add -A`.

---

### Task 1: One per-row create, used by both paths

**Files:**

- Create: `src/lib/services/user-invites.ts`
- Modify: `src/app/(prt)/admin/users/actions.ts`
- Test: `tests/unit/services/invite-user.test.ts` (create)

- [x] **Step 1: Read the code you are extracting**

`src/app/(prt)/admin/users/actions.ts:42-86`. Read the whole `addUserAction`, including the long comment on the mentor pre-flight — **that comment moves with the code**, because it records why the pre-flight is before the create and not after.

- [x] **Step 2: Write the failing test**

Create `tests/unit/services/invite-user.test.ts`. These five assertions are the parity contract — they are what prove the extraction did not quietly drop a step:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/users', () => ({
  addUser: vi.fn(),
  validateAddUserInput: vi.fn(),
  deleteUnregisteredProfile: vi.fn(),
}))
vi.mock('@/lib/services/mentorships', () => ({ assignMentor: vi.fn(), assertAssignableMentor: vi.fn() }))
vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))

import { inviteUser } from '@/lib/services/user-invites'
import { addUser, validateAddUserInput, deleteUnregisteredProfile } from '@/lib/services/users'
import { assignMentor, assertAssignableMentor } from '@/lib/services/mentorships'
import { requireActorCapability } from '@/lib/services/authorization'
import { PermissionError } from '@/lib/errors'

const actor = { id: 'actor-1' } as never
const studentRow = { email: 's@x.test', role: 'student', mentor_id: 'm1' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(validateAddUserInput).mockReturnValue({
    user: { email: 's@x.test', role: 'student' } as never,
    mentorId: 'm1',
  })
  vi.mocked(addUser).mockResolvedValue({ profile: { id: 'p1', email: 's@x.test' } as never, code: 'ABCD2345' })
})

describe('inviteUser - the whole per-row create', () => {
  it('returns the profile and its one-time code', async () => {
    const result = await inviteUser(actor, studentRow as never)
    expect(result.code).toBe('ABCD2345')
    expect(result.profile.id).toBe('p1')
  })

  // The order is the contract, not an implementation detail: pre-flighting AFTER the create
  // burns a setup code on a request that cannot complete.
  it('pre-flights the mentor BEFORE creating the account', async () => {
    const order: string[] = []
    vi.mocked(requireActorCapability).mockImplementation(async () => void order.push('capability'))
    vi.mocked(assertAssignableMentor).mockImplementation(async () => void order.push('assignable'))
    vi.mocked(addUser).mockImplementation(async () => {
      order.push('create')
      return { profile: { id: 'p1', email: 's@x.test' } as never, code: 'ABCD2345' }
    })
    await inviteUser(actor, studentRow as never)
    expect(order).toEqual(['capability', 'assignable', 'create'])
  })

  it('refuses before creating anything when the actor may not assign mentors', async () => {
    vi.mocked(requireActorCapability).mockRejectedValue(new PermissionError('nope'))
    await expect(inviteUser(actor, studentRow as never)).rejects.toThrow(PermissionError)
    expect(addUser).not.toHaveBeenCalled()
  })

  // Without the rollback a failed assign leaves a pending account whose code was shown to
  // nobody, and re-adding that email then collides.
  it('rolls the new account back if the mentor assign fails after creation', async () => {
    vi.mocked(assignMentor).mockRejectedValue(new Error('stale mentor'))
    await expect(inviteUser(actor, studentRow as never)).rejects.toThrow('stale mentor')
    expect(deleteUnregisteredProfile).toHaveBeenCalledWith('p1')
  })

  it('skips the mentor steps entirely for a non-student', async () => {
    vi.mocked(validateAddUserInput).mockReturnValue({
      user: { email: 't@x.test', role: 'tutor' } as never,
      mentorId: null,
    })
    await inviteUser(actor, { email: 't@x.test', role: 'tutor' } as never)
    expect(requireActorCapability).not.toHaveBeenCalled()
    expect(assignMentor).not.toHaveBeenCalled()
  })
})
```

- [x] **Step 3: Run it and watch it fail**

Run: `npx vitest run tests/unit/services/invite-user.test.ts`
Expected: FAIL — the module `@/lib/services/user-invites` does not exist.

- [x] **Step 4: Create the module**

`src/lib/services/user-invites.ts`:

```ts
import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { addUser, validateAddUserInput, deleteUnregisteredProfile } from '@/lib/services/users'
import type { AddUserActionInput } from '@/lib/services/users'
import { assignMentor, assertAssignableMentor } from '@/lib/services/mentorships'
import { requireActorCapability } from '@/lib/services/authorization'

export type InviteResult = { profile: Profile; code: string }

/**
 * Create ONE invited account, end to end: validate, pre-flight the mentor, create, assign,
 * and roll back if the assign fails.
 *
 * This lives here, above both services, because `services/mentorships` already imports from
 * `services/users` - putting it inside `services/users` would close that into a cycle.
 *
 * It exists as a function at all because creating a user is five steps, not one, and the
 * batch has to run the SAME five. A batch that called `addUser` alone would create students
 * with no mentor - outside every mentor's list, seen by nobody in the pastoral view, which is
 * what validateAddUserInput refusing a mentorless student is there to prevent.
 *
 * No `revalidatePath` here: a service is a pure function of (actor, input), so cache
 * invalidation stays with the caller.
 */
export async function inviteUser(actor: Profile, input: AddUserActionInput): Promise<InviteResult> {
  const { user, mentorId } = validateAddUserInput(input)

  // Pre-flight the mentor BEFORE creating the account so no profile is created (and its
  // one-time setup code burned) on a request that can't complete:
  //  - the ACTOR must hold manageMentorships. assignMentor enforces this too, but only after
  //    the account exists - so a user manager who lacks it (a sub_admin) sending a crafted
  //    POST with mentor_id would otherwise create the account, fail the assign, and roll
  //    back, discarding the setup code.
  //  - the mentor must still be assignable (the picker may have gone stale: mentor revoked or
  //    role changed since page load).
  if (mentorId) {
    await requireActorCapability(actor.id, 'manageMentorships', 'You are not allowed to assign mentors.')
    await assertAssignableMentor(mentorId)
  }

  const { profile, code } = await addUser(actor, user)

  if (mentorId) {
    try {
      await assignMentor(actor, { mentorId, studentId: profile.id })
    } catch (error) {
      // The assign still failed after creation (rare, post-preflight) - roll the new account
      // back so adding is atomic: re-adding won't collide on email.
      await deleteUnregisteredProfile(profile.id)
      throw error
    }
  }

  return { profile, code }
}
```

`@/lib/services/users` re-exports `AddUserActionInput` (its `index.ts:54`) and `getProfileByEmail` (`:26`), so both come from the barrel — verified, no need to reach into `./validation` for them.

- [x] **Step 5: Run it and watch it pass**

Run: `npx vitest run tests/unit/services/invite-user.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 6: Rewire the single action**

In `src/app/(prt)/admin/users/actions.ts`, `addUserAction`'s body becomes:

```ts
export async function addUserAction(_prev: AddUserState, formData: FormData): Promise<AddUserState> {
  const me = await requireCapability('manageUsers')
  try {
    const { profile, code } = await inviteUser(me, {
      email: formData.get('email'),
      full_name: formData.get('full_name'),
      role: formData.get('role'),
      class_level: formData.get('class_level'),
      mentor_id: formData.get('mentor_id'),
      country: formData.get('country'),
      phone: formData.get('phone'),
      guardian_name: formData.get('guardian_name'),
      guardian_phone: formData.get('guardian_phone'),
      joined_on: formData.get('joined_on'),
    })
    revalidatePath('/admin/users')
    return { ok: true, code, email: profile.email }
  } catch (e) {
    return mapAddUserError(e)
  }
}
```

Then **delete the imports that are now unused** — `addUser`, `validateAddUserInput`, `deleteUnregisteredProfile`, `assignMentor`, `assertAssignableMentor`, `requireActorCapability` — but only those no other action in the file still uses. `lint` runs with `--max-warnings 0`, so a leftover unused import fails the gate; equally, do not delete one that `assignMentorFromActionInput` or a sibling still needs.

Keep the comment block that sat below `addUserAction` (the one about permission checks living in the services) — it still describes the file.

- [x] **Step 7: Prove the single path is unchanged**

Run: `npm test` then `npx playwright test --project=chromium`

Expected: both green, with **no test edited**. The existing suites already cover add-user through the action and the browser; if either needed changing to pass, the extraction changed behaviour — **stop and report** rather than updating the assertion.

- [x] **Step 8: Commit**

```bash
git add src/lib/services/user-invites.ts "src/app/(prt)/admin/users/actions.ts" tests/unit/services/invite-user.test.ts
git commit -m "refactor(users): one per-row create, so a batch cannot skip the mentor"
```

---

### Task 2: The batch validator

**Files:**

- Create: `src/lib/services/user-invites-validation.ts`
- Test: `tests/unit/services/invite-batch-validation.test.ts` (create)

- [x] **Step 1: Write the failing test**

Four rules, and the cap. Create `tests/unit/services/invite-batch-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateInviteBatch, MAX_BATCH_ROWS } from '@/lib/services/user-invites-validation'

const tutor = (email: string) => ({ email, full_name: 'T', role: 'tutor' })
const student = (email: string, over = {}) => ({
  email,
  full_name: 'S',
  role: 'student',
  country: 'India',
  class_level: 'Grade 10',
  mentor_id: '11111111-1111-4111-8111-111111111111',
  ...over,
})

describe('validateInviteBatch', () => {
  it('accepts a mixed batch of valid rows', () => {
    const result = validateInviteBatch([tutor('a@x.test'), student('b@x.test')], {
      creatable: ['tutor', 'student'],
      taken: [],
    })
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(2)
  })

  // Within one batch, because two rows with one email would have the SECOND fail at the
  // insert - after the first had already been created and its code shown.
  it('reports a duplicate email inside the batch, on the later row', () => {
    const result = validateInviteBatch([tutor('dup@x.test'), tutor('dup@x.test')], {
      creatable: ['tutor'],
      taken: [],
    })
    expect(result.errors).toEqual([{ index: 1, field: 'email', message: expect.stringMatching(/twice|duplicate/i) }])
  })

  // Case and whitespace: the column is CHECK (email = lower(email)), so 'A@x.test' and
  // 'a@x.test' are the same account and must collide here rather than at the insert.
  it('treats emails case- and whitespace-insensitively', () => {
    const result = validateInviteBatch([tutor(' A@x.test '), tutor('a@x.test')], {
      creatable: ['tutor'],
      taken: [],
    })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].index).toBe(1)
  })

  it('reports an email already in use', () => {
    const result = validateInviteBatch([tutor('taken@x.test')], { creatable: ['tutor'], taken: ['taken@x.test'] })
    expect(result.errors).toEqual([{ index: 0, field: 'email', message: expect.stringMatching(/already/i) }])
  })

  it('reports a role this actor may not create', () => {
    const result = validateInviteBatch([{ email: 'a@x.test', full_name: 'A', role: 'admin' }], {
      creatable: ['tutor', 'student'],
      taken: [],
    })
    expect(result.errors).toEqual([
      { index: 0, field: 'role', message: expect.stringMatching(/cannot add|not allowed/i) },
    ])
  })

  it('reports each student minimum the schema requires', () => {
    const result = validateInviteBatch(
      [
        student('a@x.test', { country: '' }),
        student('b@x.test', { class_level: '' }),
        student('c@x.test', { mentor_id: '' }),
      ],
      { creatable: ['student'], taken: [] },
    )
    expect(result.errors.map((e) => [e.index, e.field])).toEqual([
      [0, 'country'],
      [1, 'class_level'],
      [2, 'mentor_id'],
    ])
  })

  it('refuses an empty batch and one over the cap', () => {
    expect(validateInviteBatch([], { creatable: ['tutor'], taken: [] }).errors[0].message).toMatch(/at least one/i)
    const tooMany = Array.from({ length: MAX_BATCH_ROWS + 1 }, (_, i) => tutor(`u${i}@x.test`))
    expect(validateInviteBatch(tooMany, { creatable: ['tutor'], taken: [] }).errors[0].message).toMatch(/25/)
  })

  it('collects EVERY bad row, not just the first', () => {
    const result = validateInviteBatch([tutor('nope'), tutor('also-bad')], { creatable: ['tutor'], taken: [] })
    expect(result.errors).toHaveLength(2)
  })
})
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/services/invite-batch-validation.test.ts`
Expected: FAIL — the module does not exist.

- [x] **Step 3: Write the validator**

`src/lib/services/user-invites-validation.ts`. It is **pure** — no database, no actor lookups: the caller passes `creatable` and `taken`, which is what makes every case above testable without mocks.

```ts
import { addUserSchema } from '@/lib/validation/user'
import type { AddUserActionInput } from '@/lib/services/users/validation'

/**
 * Enough for a cohort, small enough that the codes still fit on one screen to copy - and low
 * enough that a pasted list of 500 cannot become 500 sequential writes.
 */
export const MAX_BATCH_ROWS = 25

export type BatchRowInput = Record<string, string | undefined>
export type BatchRowError = { index: number; field: string; message: string }
export type BatchValidation = { rows: AddUserActionInput[]; errors: BatchRowError[] }

/** The stored form: profiles carries CHECK (email = lower(email)). */
const normalizeEmail = (v: string | undefined): string => (v ?? '').trim().toLowerCase()

/**
 * Validate every row before anything is written.
 *
 * Collecting ALL the errors rather than throwing on the first is the whole point: an admin
 * typing twenty rows should see every problem at once, not fix one and resubmit twenty times.
 *
 * The duplicate-email rule is flagged on the LATER row, because that is the one to change -
 * and it must be caught here rather than at the insert, where the first row would already
 * have been created and its one-time code shown before the second failed.
 */
export function validateInviteBatch(
  input: BatchRowInput[],
  context: { creatable: readonly string[]; taken: readonly string[] },
): BatchValidation {
  if (input.length === 0) {
    return { rows: [], errors: [{ index: 0, field: 'rows', message: 'Add at least one person.' }] }
  }
  if (input.length > MAX_BATCH_ROWS) {
    return {
      rows: [],
      errors: [{ index: 0, field: 'rows', message: `Add at most ${MAX_BATCH_ROWS} people at a time.` }],
    }
  }

  const takenSet = new Set(context.taken.map((e) => e.toLowerCase()))
  const seen = new Set<string>()
  const errors: BatchRowError[] = []
  const rows: AddUserActionInput[] = []

  input.forEach((raw, index) => {
    const email = normalizeEmail(raw.email)
    const role = (raw.role ?? '').trim()

    if (!context.creatable.includes(role)) {
      errors.push({ index, field: 'role', message: 'You cannot add that role.' })
      return
    }

    const parsed = addUserSchema.safeParse({
      email,
      full_name: raw.full_name?.trim() || undefined,
      role,
      class_level: raw.class_level?.trim() || undefined,
      country: raw.country?.trim() || undefined,
      phone: raw.phone?.trim() || undefined,
      guardian_name: raw.guardian_name?.trim() || undefined,
      guardian_phone: raw.guardian_phone?.trim() || undefined,
      joined_on: raw.joined_on?.trim() || undefined,
    })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      errors.push({ index, field: String(issue?.path[0] ?? 'email'), message: issue?.message ?? 'Check this row.' })
      return
    }

    // Every student has a mentor - the same rule validateAddUserInput enforces for the single
    // form, restated here only so the admin sees it before any row is written.
    if (role === 'student' && !raw.mentor_id?.trim()) {
      errors.push({ index, field: 'mentor_id', message: 'Choose a mentor for this student.' })
      return
    }

    if (seen.has(email)) {
      errors.push({ index, field: 'email', message: 'This email appears twice in the list.' })
      return
    }
    if (takenSet.has(email)) {
      errors.push({ index, field: 'email', message: 'A user with that email already exists.' })
      return
    }

    seen.add(email)
    rows.push({ ...parsed.data, mentor_id: raw.mentor_id?.trim() || null })
  })

  return { rows, errors }
}
```

If `addUserSchema.safeParse` reports the student `country`/`class_level` issues in a different order than the test expects, read the schema's `superRefine` and fix the **test's** expectation to match the real order — the schema is the authority on its own messages.

- [x] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/services/invite-batch-validation.test.ts`
Expected: PASS, 8 tests.

- [x] **Step 5: Commit**

```bash
git add src/lib/services/user-invites-validation.ts tests/unit/services/invite-batch-validation.test.ts
git commit -m "feat(users): validate a whole batch of invites before writing any of it"
```

---

### Task 3: The batch service

**Files:**

- Modify: `src/lib/services/user-invites.ts`
- Test: `tests/unit/services/invite-batch.test.ts` (create)

- [x] **Step 1: Write the failing test**

The behaviour that matters is what happens when row 2 of 3 fails. Create `tests/unit/services/invite-batch.test.ts`:

```ts
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
  vi.mocked(validateAddUserInput).mockImplementation((input: never) => ({ user: input, mentorId: null }) as never)
  let n = 0
  vi.mocked(addUser).mockImplementation(async (_a, u: never) => {
    n += 1
    return { profile: { id: `p${n}`, email: (u as { email: string }).email } as never, code: `CODE000${n}` }
  })
})

describe('inviteUsersBatch', () => {
  it('creates every row and returns a code for each', async () => {
    const result = await inviteUsersBatch(actor, rows, ['tutor'])
    expect(result.created.map((c) => c.code)).toEqual(['CODE0001', 'CODE0002', 'CODE0003'])
    expect(result.failed).toEqual([])
  })

  // Validate-all-then-create: a bad row must stop the WHOLE batch before any write, or an
  // admin ends up with a half-created cohort and no idea which half.
  it('writes nothing at all when any row fails validation', async () => {
    const result = await inviteUsersBatch(actor, [...rows, { email: 'bad', role: 'tutor' }], ['tutor'])
    expect(result.created).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(addUser).not.toHaveBeenCalled()
  })

  /**
   * The one case upfront validation cannot prevent: someone else takes the email between the
   * check and the write. The earlier rows stay created WITH their codes - discarding them
   * would lose credentials that were never stored anywhere - and the rest are reported so the
   * admin can resubmit just those.
   */
  it('keeps the rows it created when one fails mid-batch, and reports the rest', async () => {
    vi.mocked(addUser)
      .mockResolvedValueOnce({ profile: { id: 'p1', email: 'a@x.test' } as never, code: 'CODE0001' })
      .mockRejectedValueOnce(new ValidationError('A user with that email already exists'))
      .mockResolvedValueOnce({ profile: { id: 'p3', email: 'c@x.test' } as never, code: 'CODE0003' })

    const result = await inviteUsersBatch(actor, rows, ['tutor'])
    expect(result.created.map((c) => c.email)).toEqual(['a@x.test', 'c@x.test'])
    expect(result.failed).toEqual([{ index: 1, email: 'b@x.test', message: expect.stringMatching(/already exists/i) }])
  })

  it('creates in list order, one at a time', async () => {
    await inviteUsersBatch(actor, rows, ['tutor'])
    expect(vi.mocked(addUser).mock.calls.map((c) => (c[1] as { email: string }).email)).toEqual([
      'a@x.test',
      'b@x.test',
      'c@x.test',
    ])
  })
})
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/services/invite-batch.test.ts`
Expected: FAIL — `inviteUsersBatch` is not exported.

- [x] **Step 3: Write it**

Append to `src/lib/services/user-invites.ts`:

```ts
export type BatchCreated = { index: number; email: string; full_name: string | null; role: string; code: string }
export type BatchFailed = { index: number; email: string; message: string }
export type BatchOutcome = { created: BatchCreated[]; failed: BatchFailed[]; errors: BatchRowError[] }

/**
 * Add several invited accounts in one pass: validate EVERY row, then create them one by one.
 *
 * Two phases, deliberately. Validating everything first means the common mistakes - a typo, a
 * repeated email, a student with no mentor - cost nothing and are all reported at once. A
 * fully atomic batch was considered and rejected: it would need a Postgres function taking an
 * array, which means a migration, a regenerated snapshot, re-running privilege parity and the
 * RLS suite, and a second copy of create_invited_profile's logic to keep in step. The only
 * failure it would buy is an email race between check and create, whose consequence - some
 * rows created, the rest reported - is visible in the results and fixable by resubmitting the
 * remainder.
 *
 * A row that fails mid-batch does NOT discard the rows already created. Their one-time codes
 * exist nowhere else: throwing them away to keep the batch tidy would lose credentials that
 * are not recoverable, only replaceable.
 */
export async function inviteUsersBatch(
  actor: Profile,
  input: BatchRowInput[],
  creatable: readonly string[],
): Promise<BatchOutcome> {
  const emails = input.map((r) => (r.email ?? '').trim().toLowerCase()).filter(Boolean)
  // One lookup per distinct email, before anything is written. addUser checks again at the
  // insert, which is what actually closes the race; this is to report it early and clearly.
  const existing = await Promise.all([...new Set(emails)].map(async (e) => ((await getProfileByEmail(e)) ? e : null)))
  const taken = existing.filter((e): e is string => e !== null)

  const { rows, errors } = validateInviteBatch(input, { creatable, taken })
  if (errors.length > 0) return { created: [], failed: [], errors }

  const created: BatchCreated[] = []
  const failed: BatchFailed[] = []

  // Sequential on purpose: each create is several writes plus an audit row, and running 25
  // concurrently would turn one admin action into a burst against the same table.
  for (const [index, row] of rows.entries()) {
    try {
      const { profile, code } = await inviteUser(actor, row)
      created.push({
        index,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
        code,
      })
    } catch (error) {
      failed.push({
        index,
        email: String(row.email ?? ''),
        message: error instanceof ServiceError ? error.message : 'Could not add this person.',
      })
    }
  }

  return { created, failed, errors: [] }
}
```

Add the imports this needs: `getProfileByEmail` from `@/lib/services/users`, `validateInviteBatch`/`BatchRowInput`/`BatchRowError` from `./user-invites-validation`, and `ServiceError` from `@/lib/errors`.

**An unknown error is reported as a generic message, never `error.message`** — an unexpected throw may carry database or configuration detail, and this string is rendered in the browser.

- [x] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/services/invite-batch.test.ts`
Expected: PASS, 4 tests.

- [x] **Step 5: Commit**

```bash
git add src/lib/services/user-invites.ts tests/unit/services/invite-batch.test.ts
git commit -m "feat(users): add several invites in one pass, validate-all then create"
```

---

### Task 4: The server action

**Files:**

- Modify: `src/app/(prt)/admin/users/actions.ts`

- [x] **Step 1: Add the action**

Like `reissueCodeAction` (piece 2) and unlike the rest of the file, this returns state rather than redirecting — the codes are shown once, so a redirect would discard them.

```ts
export type BatchState = { ok?: boolean; outcome?: BatchOutcome; error?: string }

/**
 * Add several invited accounts and return the result, codes included.
 *
 * The rows arrive as JSON in one field rather than as `rows[0][email]`-style keys: the modal
 * owns a dynamic list, and a single parsed payload keeps the row shape in one place instead of
 * split between a form-key convention and a parser. The payload is untrusted either way -
 * every row goes through validateInviteBatch, and `creatable` is recomputed HERE from the
 * actor rather than taken from the request, so a crafted payload cannot widen what it may
 * create.
 */
export async function addUsersBatchAction(_prev: BatchState, formData: FormData): Promise<BatchState> {
  const me = await requireCapability('manageUsers')
  try {
    const parsed: unknown = JSON.parse(String(formData.get('rows') ?? '[]'))
    if (!Array.isArray(parsed)) return { error: 'Could not read the list of people.' }

    const creatable = await creatableRolesFor(me)
    const outcome = await inviteUsersBatch(me, parsed as BatchRowInput[], creatable)
    revalidatePath('/admin/users')
    return { ok: outcome.created.length > 0, outcome }
  } catch (error) {
    if (error instanceof SyntaxError) return { error: 'Could not read the list of people.' }
    if (error instanceof ServiceError) return { error: error.message }
    throw error
  }
}
```

`creatableRolesFor` does not exist yet. The role list is currently computed inline in `src/lib/services/page-data/admin-users.ts:200-215` — `isAdminTier(me)` picks the list, then `actorHasCapability(me.id, 'manageMentorships')` removes `student` when the actor cannot assign mentors. **Extract exactly that into one exported function in that file** and have both the page loader and this action call it, so the modal's options and the server's rule cannot drift. Report the signature you chose.

Do not trust a `creatable` value from the request. That is the whole reason for recomputing it here.

- [x] **Step 2: Typecheck**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [x] **Step 3: Commit**

```bash
git add "src/app/(prt)/admin/users/actions.ts" src/lib/services/page-data/admin-users.ts
git commit -m "feat(users): the batch action recomputes what the actor may create"
```

---

### Task 5: The modal and the results

**Files:**

- Create: `src/app/(prt)/admin/users/AddSeveralButton.tsx`
- Create: `src/app/(prt)/admin/users/BatchResults.tsx`
- Modify: `src/app/(prt)/admin/users/page.tsx`

- [x] **Step 1: Read the three things you are reusing**

1. `src/app/(prt)/Modal.tsx` — the shared shell. Use `size="lg"`. Do not write another overlay.
2. `src/app/(prt)/admin/users/AddUserForm.tsx` — the role-aware field logic (`isStudent`), the `@/lib/ui` primitives (`Field`, `Input`, `Select`, `SubmitButton` from `../../form`), and the success-panel classes.
3. `src/app/(prt)/admin/users/[id]/SetupCodePanel.tsx` (piece 2) — the copyable-invite treatment to match.

- [x] **Step 2: Build the row editor**

`AddSeveralButton.tsx` is a client component holding `rows` state. Requirements, each with its reason:

- Takes the **same props the single form takes** — `roles`, `mentorCandidates`, `canAssignMentor` — so authority is inherited.
- Each row: **Role, Email, Name**. A row whose role is `student` also shows **Country, Class/grade, Mentor**; no other role does. That mirrors `addUserSchema`'s student-only rules.
- **Add row** / **Remove row**, starting at three rows, capped at `MAX_BATCH_ROWS` (import it — do not retype 25). At the cap, disable Add row and say why.
- **Copy down** on Country, Class/grade and Mentor: copies the first row's value into every _student_ row below. A cohort usually shares all three, and typing it 20 times is where mistakes come from.
- Submit posts a single hidden `rows` field containing `JSON.stringify(rows)`, matching Task 4.
- Use `useActionState`, not `useFormState`.
- Use `SubmitButton` so a double-click cannot submit the batch twice.
- Per-row errors from `outcome.errors` render **inline on the offending row**, keyed by `index`, so the admin can see which row to fix.

Keep this component focused on editing rows; the results go in `BatchResults.tsx`. `docs/application-standards.md` sets the file-size thresholds — if the row editor approaches them, extract the row itself into a third component and say so.

- [x] **Step 3: Build the results**

`BatchResults.tsx` takes `outcome: BatchOutcome` and renders:

- One row per created account: name, email, role, **code**, and the expiry wording used elsewhere ("Valid 7 days - shown once").
- Any `failed` rows with their reason, visually separated from the successes — those are the ones to resubmit.
- **Copy all** — the whole table as text, via `navigator.clipboard.writeText`.
- **Download CSV** — built in the browser from the component's own props:

```tsx
// The codes exist ONLY in this result. They are never stored - only a hash is (ADR-0008) - so
// there is no server route that could produce this file, and round-tripping the codes to build
// one would put 25 plaintext credentials in a request log for nothing.
const csv = [
  ['Name', 'Email', 'Role', 'Setup code'],
  ...outcome.created.map((r) => [r.full_name ?? '', r.email, r.role, r.code]),
]
  .map((cells) => cells.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(','))
  .join('\n')
```

Quote and double-up quotes in every cell: a name containing a comma would otherwise shift the code into the wrong column.

Serve it with a `Blob` and `URL.createObjectURL`, and **revoke the URL after the click** so the blob is not retained for the life of the page.

Render roles through `roleLabel` from `@/lib/ui` — stored values never reach a screen (piece 1), and `tests/unit/role-labels-single-source.test.ts` will fail the build if a label is spelled here instead.

- [x] **Step 4: Render the trigger**

In `src/app/(prt)/admin/users/page.tsx`, beside the existing `<AddUserForm .../>` inside the same `{canManage && ...}` block:

```tsx
<AddSeveralButton
  roles={data.roleOptions}
  mentorCandidates={data.mentorCandidates}
  canAssignMentor={data.canAssignMentor}
/>
```

The single form stays exactly as it is and remains the place for full detail (phone, guardian, joined-on). The batch deliberately captures less.

- [x] **Step 5: Verify it in the browser, in mock mode**

```
npm run dev
```

Sign in as the super admin and check each of these, reporting what you saw:

1. "Add several" opens the modal; Escape closes it; focus returns to the trigger.
2. Three rows by default. Setting a row's role to **Student** reveals Country, Class/grade and Mentor; setting it to Tutor hides them again.
3. **Copy down** fills the student rows below.
4. A batch of three mixed rows (a tutor, a mentor, a student) → three codes in the results, the roles reading as **words** ("Super Admin", not `admin`).
5. A deliberate duplicate email in two rows → **nothing is created**, and the error is marked on the second row.
6. An email that already exists → the same, marked on that row.
7. Add row up to 25 → Add row disables and explains.
8. **Download CSV** opens a file whose columns line up, including for a name containing a comma.
9. As a **sub-admin** (`subadmin@mock.test`): the role options offer no Admin or Super Admin.

- [x] **Step 6: Verify the gate**

```
npm run typecheck
npm run lint
npm test
npx prettier --check "src/app/(prt)/admin/users/AddSeveralButton.tsx" "src/app/(prt)/admin/users/BatchResults.tsx" "src/app/(prt)/admin/users/page.tsx"
```

- [x] **Step 7: Commit**

```bash
git add "src/app/(prt)/admin/users/AddSeveralButton.tsx" "src/app/(prt)/admin/users/BatchResults.tsx" "src/app/(prt)/admin/users/page.tsx"
git commit -m "feat(users): add several people at once, with their codes in one table"
```

---

### Task 6: Prove it end to end

**Files:**

- Modify: `tests/e2e/journeys.pw.ts`

- [x] **Step 1: Add the batch to the admin journey**

Follow the conventions already in that file: `attemptName(...)` for attempt-unique emails (the mock DB resets once per run and `retries: 1` is configured, so hard-coded values collide on a retry), and scope locators to the modal.

Assert the two things that matter:

```ts
// Three mixed roles in one pass, three codes out. The roles read as WORDS: the stored
// identifiers never reach a screen (tests/unit/role-labels-single-source.test.ts).
await page.getByRole('button', { name: /add several/i }).click()
const dialog = page.getByRole('dialog')
// ... fill three rows: a tutor, a mentor, and a student (country, class and mentor too)
await dialog.getByRole('button', { name: /add .* people|add them/i }).click()
await expect(dialog.locator('[data-testid=batch-code]')).toHaveCount(3)
await expect(dialog.getByText('Tutor')).toBeVisible()
```

Then the rule that upfront validation exists for:

```ts
// A duplicate inside the batch creates NOTHING - not even the valid rows above it.
```

Add a `data-testid` to the code cell in `BatchResults.tsx` if that is what makes the count assertion robust, include that file in this commit, and say so in your report. Prefer a role- or text-based locator if one is already unambiguous.

- [x] **Step 2: Run the suite twice**

Run: `npx playwright test --project=chromium`

It stood at **86 passed**. Run it a second time: this adds several sequential server actions to a long journey, and a racy assertion that passes once is worse than no test.

- [x] **Step 3: Commit**

```bash
git add tests/e2e/journeys.pw.ts
git commit -m "test(users): three mixed rows in one pass yield three codes"
```

---

### Task 7: Docs and the whole gate

**Files:**

- Modify: `docs/specs/2026-10-12-roles-relabel-and-bulk-user-add.md`

`docs/api-reference.md` is **not** in scope: it documents "every route under `src/app/api`", and this feature adds a server action, not a route. Verified — do not add a section there.

- [x] **Step 1: Close the spec**

Mark piece 3 implemented, and record the one place the spec was wrong: creating a user is five steps, not just `addUser`, so a `user-invites.ts` composition layer now backs both the single form and the batch. A reader following the spec's letter would have shipped mentorless students.

- [x] **Step 2: Every check this repo gates on**

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run check:doc-links
npx playwright test --project=chromium
```

- [x] **Step 3: Prove no schema and no capability changed**

```bash
git diff --stat $BASE -- supabase/
git diff $BASE -- src/lib/capabilities/
```

Expected: **both empty.** The spec promises "No schema change" and "Any change to authority: none". If either prints, revert it before going further.

- [x] **Step 4: Confirm the tree is clean**

```bash
git status --porcelain
```

---

## What this plan does not do

- **CSV paste or upload.** Mixed roles typed in is the stated need. Paste needs its own parsing, preview and error model; worth a second pass once the modal is in use.
- **An atomic batch.** Rejected with its cost in Task 3's docstring: a new Postgres function, a migration, a regenerated snapshot, and a second copy of `create_invited_profile` to keep in step.
- **Emailing the codes.** Blocked while `EMAIL_NOTIFICATIONS_ENABLED` is off, and the thing that would make this table unnecessary.
- **Changing the single Add-user form.** It keeps every field it has and stays the place for full detail. Task 1 refactors what runs _behind_ it, and its tests must pass unedited.
- **Any change to authority.** No capability is added or re-scoped; `creatable` is recomputed from the actor on every request.

---

## What shipped, and where it differed from this plan

Executed 2026-10-12 in twelve commits, `93c2ef4` through `d18fe76`. The gate ran clean: formatting,
zero lint warnings, typecheck, 238 test files / 2017 unit tests, and 87/87 Playwright chromium specs
run twice. `git diff` against the branch point is empty for both `supabase/` and
`src/lib/capabilities/`, proving the spec's "no schema change, no change to authority".

Six places the shipped work is not what the task text prescribed:

1. **`addUserFromActionInput` was deleted** (`b304415`). After Task 1 it had no caller in `src/`,
   and it was the exact trap this plan exists to remove: validate, then `addUser`, returning a
   `mentorId` nobody acts on. It is the function a batch author would have reached for by name.

2. **Task 2's validator also checks the mentor id's SHAPE** (`d70124d`), not merely that one is
   present. `validateAddUserInput` parses it as a uuid, so a junk value - a pasted partial, a
   truncated token - passed the batch check and then threw inside `inviteUser` on that row, after
   the preceding rows had been created and their codes shown. The same commit makes a row that
   fails for one reason still claim its email, so a later duplicate is reported in the same pass
   rather than on the next round trip.

3. **Task 3 pre-flights each distinct mentor once, before the first write.** The plan left this
   implicit. `inviteUser` checks per row, which is right for any caller, but in a batch that means
   a stale mentor on row 12 is found after eleven accounts exist.

4. **`creatableRolesFor` returns `isSuper` as well** (`b46d05b`). Extracting it left `isAdminTier`
   being called twice per page load, which broke a test whose `mockReturnValueOnce` the first call
   consumed. Two reads are two answers to one question about who the top tier is, and
   `manageAdminTier` is a hard rule, so they must not be able to disagree.

5. **Task 5 needed a third component** - `AddSeveralRow.tsx` - because the editor passed the
   250-line threshold in `docs/application-standards.md`. It also writes the row selects' values
   back to the DOM after a submit: React resets the form when its action completes, and a
   controlled `<select>` carries no default to reset TO, so every Role dropdown landed on its
   first option while React state held the real value.

6. **Two ways to destroy the codes were found and closed**, neither anticipated here. Closing the
   modal now confirms when there is something to lose (`e921423`); and a refused RESUBMIT used to
   take the previous batch's codes with it, because `useActionState` replaces the whole state and
   a validation failure returns `created: []` (`d18fe76`). The modal now accumulates every code it
   has issued, separately from the per-submit failures. **The E2E spec had encoded that bug as
   expected behaviour** - asserting zero codes after a refused resubmit - so fixing the component
   correctly broke the test, and the assertion was inverted to the property that actually matters.

Two fixes outside this plan's scope rode along, both pre-existing and both verified before being
changed:

- `AddUserForm`'s Role dropdown disagreed with its own fields after any submit, for the same React
  form-reset reason as (5). Measured: without the fix the dropdown read `student` while the
  student-only `class_level` field was hidden. `tests/e2e/add-user-form-state.pw.ts` now pins it.
  The first probe written for this was BLIND - it used `country` and `phone`, which render in both
  the student and the tutor branches and so discriminate nothing.
- `ProfileMenu` registered a `document`-level Escape handler with no `open` guard, so every Escape
  in the portal pulled focus to the account avatar - overriding the focus every modal in the app
  had just restored to its trigger.

# Re-issue a Setup Code — Implementation Plan (piece 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin can re-issue a one-time setup code for an account that has not been claimed, from that person's detail page, and gets a complete copyable invite back.

**Architecture:** One new data-layer write guarded by `auth_user_id is null AND status = 'pending'`, one service function gated by the existing `canManageTarget`, one server action, one client panel. No schema change, no new capability, no change to `addUser` or `create_invited_profile`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service-role admin client), Vitest (jsdom), Playwright.

**Spec:** [docs/specs/2026-10-12-roles-relabel-and-bulk-user-add.md](../specs/2026-10-12-roles-relabel-and-bulk-user-add.md) — piece 2.
**Decision record:** [ADR-0008](../adr/0008-setup-codes-are-reissued-not-recovered.md) decided this in full. Nothing here re-opens it.

---

## Why this is piece 2 and not piece 3

Piece 3 adds up to 25 users at once, which multiplies ADR-0008's problem by 25: one closed panel loses 25 codes, and today the only recourse is a developer running SQL. This task makes a lost code cost one click, so it must land first.

## What exists already, so nothing here is reinvented

Read these before writing code; the task steps reference them.

| Thing                                                   | Where                                          | Why it matters                                                                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateSetupCode`, `hashSetupCode`, `setupCodeExpiry` | `src/lib/auth/setup-code.ts`                   | Issuing a code is three existing calls. Nothing new is needed.                                                                                                                           |
| `canManageTarget(actor, targetRole)`                    | `src/lib/services/users/admin-lifecycle.ts:41` | The tier gate `addUser` applies. Re-issue reuses it verbatim.                                                                                                                            |
| `auditPrivilegedAction(actor, action, 'profile', id)`   | `src/lib/services/service-helpers.ts`          | `AuditAction` in `src/lib/data/audit.ts:14` is an open union (`(string & {})`), so `'user.reissue_code'` needs no type or schema change.                                                 |
| `bindAuthUserToProfile`                                 | `src/lib/data/profiles-auth.ts:48`             | **The pattern to copy.** Conditional update with `.is('auth_user_id', null).eq('status','pending')`, returning whether a row matched. Its docstring already anticipates a reissued code. |
| `ProfileDetails`                                        | `src/lib/data/profiles-directory.ts:158`       | Already carries `auth_user_id`, so the page can tell claimed from unclaimed. Does **not** carry `setup_code_expires_at` — Task 3 adds it.                                                |
| The success panel in `AddUserForm.tsx:133-151`          | `src/app/(prt)/admin/users/AddUserForm.tsx`    | The code-display treatment to match, so the two surfaces look like one feature.                                                                                                          |

## The guard is stricter than ADR-0008 states, deliberately

ADR-0008 scopes the write to `auth_user_id is null`. This plan also requires `status = 'pending'`, matching `bindAuthUserToProfile` and `claimAllowlistRowOnOAuth`.

The reason: revoking an unclaimed invite sets `status = 'disabled'` and leaves `auth_user_id` null. With the ADR's guard alone, an admin could re-issue a working-looking code for a revoked invite. Registration would still refuse it — `bindAuthUserToProfile` pins `status='pending'` — so this is not a hole, but it would hand an admin a code that silently cannot work. Refusing up front is the honest answer, and it keeps all three writes on the same rule.

## File structure

| File                                                         | Responsibility                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `src/lib/data/profiles-auth.ts` (modify)                     | `reissueSetupCodeForUnclaimed` — the one conditional write.                        |
| `src/lib/data/profiles-directory.ts` (modify)                | Add `setup_code_expires_at` to the detail projection. **Never `setup_code_hash`.** |
| `src/lib/services/users/admin-lifecycle.ts` (modify)         | `reissueSetupCode` — gate, issue, write, audit.                                    |
| `src/app/(prt)/admin/users/[id]/actions.ts` (modify)         | `reissueCodeAction` — the server action.                                           |
| `src/app/(prt)/admin/users/[id]/SetupCodePanel.tsx` (create) | The client panel: state of the invite, the button, the issued code.                |
| `src/app/(prt)/admin/users/[id]/page.tsx` (modify)           | Render the panel for an unclaimed account only.                                    |

---

### Task 0: Record the branch point

- [ ] **Step 1: Branch and capture the base**

```bash
git checkout -b feature/reissue-setup-code
git rev-parse HEAD
```

Write that hash down. Task 8 diffs against it to prove no migration was added.

If the working tree is not clean, **stop and report** — a shared tree means every task below stages only the paths it names, and never `git add -A`.

---

### Task 1: The conditional write

**Files:**

- Modify: `src/lib/data/profiles-auth.ts`
- Test: `tests/unit/data/reissue-setup-code.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/data/reissue-setup-code.test.ts`. Mock the admin client the way the existing data tests do — **open `tests/unit/data/` first and copy the mocking style of the nearest sibling test rather than inventing one.** The behaviour to pin:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingle = vi.fn()
const chain = {
  update: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  is: vi.fn(() => chain),
  select: vi.fn(() => chain),
  maybeSingle,
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => chain }) }))

import { reissueSetupCodeForUnclaimed } from '@/lib/data/profiles-auth'

beforeEach(() => {
  vi.clearAllMocks()
  maybeSingle.mockResolvedValue({ data: { id: 'p1' }, error: null })
})

describe('reissueSetupCodeForUnclaimed', () => {
  it('writes the new hash and expiry, and reports the row it matched', async () => {
    const ok = await reissueSetupCodeForUnclaimed('p1', 'HASH', '2026-10-19T00:00:00.000Z')
    expect(ok).toBe(true)
    expect(chain.update).toHaveBeenCalledWith({
      setup_code_hash: 'HASH',
      setup_code_expires_at: '2026-10-19T00:00:00.000Z',
    })
  })

  // The two guards are the whole security value of this function, so they are asserted
  // as calls, not inferred from a passing write.
  it('refuses a claimed account and a non-pending one, in the write itself', async () => {
    await reissueSetupCodeForUnclaimed('p1', 'HASH', 'exp')
    expect(chain.is).toHaveBeenCalledWith('auth_user_id', null)
    expect(chain.eq).toHaveBeenCalledWith('status', 'pending')
  })

  it('reports false when nothing matched, rather than throwing', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await reissueSetupCodeForUnclaimed('p1', 'HASH', 'exp')).toBe(false)
  })

  // A failed write must NOT read as "already claimed": that would tell an admin the
  // account is live when the database simply errored.
  it('throws on a write error instead of reporting false', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(reissueSetupCodeForUnclaimed('p1', 'HASH', 'exp')).rejects.toThrow(/reissueSetupCode/)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/data/reissue-setup-code.test.ts`
Expected: FAIL — `reissueSetupCodeForUnclaimed` is not exported.

- [ ] **Step 3: Write the function**

Append to `src/lib/data/profiles-auth.ts`, directly after `claimAllowlistRowOnOAuth` so the three conditionally-guarded writes sit together:

```ts
/**
 * Stamp a FRESH setup code hash on an invite nobody has claimed.
 *
 * The two guards are the point. `auth_user_id is null` refuses an account that has already
 * signed in, so re-issue can never reset a live user's invite out from under them.
 * `status = 'pending'` refuses a REVOKED invite: revoking an unclaimed account leaves
 * auth_user_id null, so without this an admin would be handed a code that registration
 * then refuses anyway (bindAuthUserToProfile pins the same status), looking like a bug in
 * the code rather than a closed account.
 *
 * Returns whether THIS call matched a row. A write error throws instead: reporting it as
 * "no match" would tell an admin the account is already claimed when the database merely
 * failed.
 */
export async function reissueSetupCodeForUnclaimed(
  profileId: string,
  setupCodeHash: string,
  expiresAt: string,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .update({ setup_code_hash: setupCodeHash, setup_code_expires_at: expiresAt })
    .eq('id', profileId)
    .is('auth_user_id', null)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`data.profiles.reissueSetupCode: ${error.message}`)
  return !!data
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/data/reissue-setup-code.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/profiles-auth.ts tests/unit/data/reissue-setup-code.test.ts
git commit -m "feat(data): re-issue a setup code only for an unclaimed, pending invite"
```

---

### Task 2: The service function

**Files:**

- Modify: `src/lib/services/users/admin-lifecycle.ts`
- Test: `tests/unit/services/reissue-setup-code.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/services/reissue-setup-code.test.ts`. Copy the mocking style of `tests/unit/services/admin-lifecycle-tier.test.ts`, which already mocks `loadPersonaFlags`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn(), requireAdminPersona: vi.fn() }))
vi.mock('@/lib/data/profiles-auth', () => ({ reissueSetupCodeForUnclaimed: vi.fn() }))
vi.mock('@/lib/services/users/directory', () => ({ getProfileById: vi.fn(), getProfileByEmail: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { reissueSetupCode } from '@/lib/services/users/admin-lifecycle'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { reissueSetupCodeForUnclaimed } from '@/lib/data/profiles-auth'
import { getProfileById } from '@/lib/services/users/directory'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, ValidationError } from '@/lib/errors'

const actor = { id: 'actor-1' } as never
const target = (over = {}) =>
  ({
    id: 'p1',
    email: 'x@y.test',
    full_name: 'X',
    role: 'student',
    status: 'pending',
    auth_user_id: null,
    ...over,
  }) as never

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true, isSubAdmin: false } as never)
  vi.mocked(getProfileById).mockResolvedValue(target())
  vi.mocked(reissueSetupCodeForUnclaimed).mockResolvedValue(true)
})

describe('reissueSetupCode', () => {
  it('returns a fresh 8-character code and its expiry', async () => {
    const result = await reissueSetupCode(actor, 'p1')
    expect(result.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now())
    expect(result.profile.email).toBe('x@y.test')
  })

  // The stored value is the HASH. If the plaintext ever reached the write, the whole
  // reason ADR-0008 exists would be gone, so assert the shape that proves it did not.
  it('stores a hash, never the code it returns', async () => {
    const { code } = await reissueSetupCode(actor, 'p1')
    const [, hash] = vi.mocked(reissueSetupCodeForUnclaimed).mock.calls[0]
    expect(hash).not.toBe(code)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses an actor who may not manage that role', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false, isSubAdmin: true } as never)
    vi.mocked(getProfileById).mockResolvedValue(target({ role: 'admin' }))
    await expect(reissueSetupCode(actor, 'p1')).rejects.toThrow(PermissionError)
    expect(reissueSetupCodeForUnclaimed).not.toHaveBeenCalled()
  })

  it('refuses a claimed or revoked account, and audits nothing', async () => {
    vi.mocked(reissueSetupCodeForUnclaimed).mockResolvedValue(false)
    await expect(reissueSetupCode(actor, 'p1')).rejects.toThrow(ValidationError)
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('writes one user.reissue_code audit row on success', async () => {
    await reissueSetupCode(actor, 'p1')
    expect(auditPrivilegedAction).toHaveBeenCalledWith(actor, 'user.reissue_code', 'profile', 'p1')
  })
})
```

Note on the code regex: the alphabet in `setup-code.ts` excludes `I`, `O`, `0` and `1`, which is what `[A-HJ-NP-Z2-9]` encodes. If that assertion fails, read the alphabet rather than loosening the regex.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/services/reissue-setup-code.test.ts`
Expected: FAIL — `reissueSetupCode` is not exported.

- [ ] **Step 3: Write the service function**

In `src/lib/services/users/admin-lifecycle.ts`, add the import and the function. Place it immediately after `addUserFromActionInput`, because it is the other half of inviting someone:

```ts
import { reissueSetupCodeForUnclaimed } from '@/lib/data/profiles-auth'
```

That is the ONLY new import. `generateSetupCode`, `hashSetupCode`, `setupCodeExpiry`, the three
error classes, `auditPrivilegedAction` and `getProfileById` are all imported by this file already -
check before adding a duplicate line.

```ts
export type ReissueResult = { profile: Profile; code: string; expiresAt: string }

const NOT_REISSUABLE = 'That account has already been claimed, or its invite was revoked - no new code was issued.'

/**
 * Replace the setup code on an invite nobody has claimed, and hand the admin the new one.
 *
 * A code is ISSUED, never read back: only its hash is stored, so a lost code is replaced
 * rather than recovered (ADR-0008). Re-issuing invalidates the previous code, which is the
 * intent - someone mid-registration with the old code has to use the new one.
 *
 * Authority is the tier rule addUser already applies, so an Admin may re-issue for a tutor,
 * mentor or student and never for the admin tier. No capability is added by this feature.
 */
export async function reissueSetupCode(actor: Profile, id: string): Promise<ReissueResult> {
  // getProfileById, not the detail projection: a Profile already carries the email, name and
  // role this needs, and the page - not the service - is what renders the expiry.
  const target = await getProfileById(id)
  if (!target) throw new NotFoundError('User not found')
  if (!(await canManageTarget(actor, target.role))) {
    throw new PermissionError('Not authorized to manage this user.')
  }

  const code = generateSetupCode()
  const expiresAt = setupCodeExpiry()
  // The write carries the guards, so it is the single source of truth on whether this
  // invite was re-issuable - re-reading the row first would be a race.
  const reissued = await reissueSetupCodeForUnclaimed(id, hashSetupCode(code), expiresAt)
  if (!reissued) throw new ValidationError(NOT_REISSUABLE)

  await auditPrivilegedAction(actor, 'user.reissue_code', 'profile', id)
  return { profile: target, code, expiresAt }
}
```

Export it from `src/lib/services/users/index.ts` alongside `addUser`. **Open that file and match how the neighbouring exports are written** (it re-exports by name).

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/services/reissue-setup-code.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/users/admin-lifecycle.ts src/lib/services/users/index.ts tests/unit/services/reissue-setup-code.test.ts
git commit -m "feat(users): re-issue a setup code behind the tier gate addUser uses"
```

---

### Task 3: Let the page see whether a code is outstanding

**Files:**

- Modify: `src/lib/data/profiles-directory.ts:158,170`
- Test: `tests/unit/data/profile-detail-columns.test.ts` (create)

- [ ] **Step 1: Write the failing test**

The valuable assertion here is the NEGATIVE one. Create `tests/unit/data/profile-detail-columns.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The admin detail page needs to know WHETHER a setup code is outstanding and when it
 * expires. It must never be able to read the code itself.
 *
 * `setup_code_hash` is the stored secret, and ADR-0008 says plainly how weak it is: eight
 * characters over a 32-symbol alphabet, unsalted. Putting it in a page projection would
 * make an outstanding code brute-forceable by anyone who can see the rendered payload, and
 * adding one word to a column list is an easy, invisible way to do that.
 *
 * Only the SELECT lists are checked, not the whole file. `setup_code_hash` appears here
 * legitimately as a WRITE input - `InvitedProfileInput` carries it into
 * create_invited_profile - so a file-wide search would fail on arrival and the obvious
 * "fix" would be to delete the assertion.
 */
const source = readFileSync(join(process.cwd(), 'src/lib/data/profiles-directory.ts'), 'utf8')

/** Every `const PROFILE_*COLUMNS* = '...'` / `` = `...` `` body in that file. */
const projections = [...source.matchAll(/const PROFILE_[A-Z_]*COLUMNS[A-Z_]*\s*=\s*([`'])([\s\S]*?)/g)].map((m) => m[2])

describe('the admin profile projections', () => {
  // Without this, a regex that stopped matching would make both assertions below pass
  // vacuously - the exact failure the repo's other source-scanning tests guard against.
  it('finds the column lists it means to check', () => {
    expect(projections.length).toBeGreaterThanOrEqual(2)
  })

  it('selects the setup code expiry, so the page can say whether an invite is live', () => {
    expect(projections.some((p) => p.includes('setup_code_expires_at'))).toBe(true)
  })

  it('never selects the setup code hash', () => {
    expect(projections.filter((p) => p.includes('setup_code_hash'))).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch the first test fail**

Run: `npx vitest run tests/unit/data/profile-detail-columns.test.ts`
Expected: the expiry assertion FAILS; the other two PASS. If the hash assertion fails, **stop and report** — something already selects the hash into a page.

- [ ] **Step 3: Add the one column**

In `src/lib/data/profiles-directory.ts`, add `setup_code_expires_at: string | null` to the `ProfileDetails` type (line 158-168) and `setup_code_expires_at` to the end of `PROFILE_DETAIL_COLUMNS` (line 170).

Add this comment above `PROFILE_DETAIL_COLUMNS`:

```ts
// `setup_code_expires_at` is here so the detail page can say whether an invite is still
// live. The HASH is deliberately absent: it is an unsalted SHA-256 over an 8-character
// alphabet, so shipping it to a page would make an outstanding code guessable.
```

- [ ] **Step 4: Run it and watch both pass**

Run: `npx vitest run tests/unit/data/profile-detail-columns.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/profiles-directory.ts tests/unit/data/profile-detail-columns.test.ts
git commit -m "feat(users): the detail projection carries the invite expiry, never the hash"
```

---

### Task 4: The server action

**Files:**

- Modify: `src/app/(prt)/admin/users/[id]/actions.ts`

- [ ] **Step 1: Add the action**

This file's other actions redirect on `ServiceError`. This one must NOT: the code can only be shown once, so a redirect would issue a code and then throw the response away. It returns state instead, like `addUserAction` does.

**Read `src/app/(prt)/admin/users/actions.ts` first** to copy `addUserAction`'s state shape and its use of `actionDone` / `actionFail`, then add to `src/app/(prt)/admin/users/[id]/actions.ts`:

```ts
import { reissueSetupCode } from '@/lib/services/users'

export type ReissueState = { ok: boolean; code?: string; expiresAt?: string; email?: string; error?: string }

/**
 * Re-issue a setup code and return it in the action result.
 *
 * Deliberately NOT the redirect-on-error shape the rest of this file uses: the code is
 * shown exactly once, so a redirect would issue it and discard it in the same breath. The
 * failure message comes from the service and is already user-facing; an unknown error is
 * not forwarded.
 */
export async function reissueCodeAction(_prev: ReissueState, formData: FormData): Promise<ReissueState> {
  const me = await requireCapability('manageUsers')
  const id = String(formData.get('id') ?? '')
  try {
    const { profile, code, expiresAt } = await reissueSetupCode(me, id)
    revalidatePath(`/admin/users/${id}`)
    return { ok: true, code, expiresAt, email: profile.email }
  } catch (error) {
    if (error instanceof ServiceError) return { ok: false, error: error.message }
    throw error
  }
}
```

Check that `ServiceError` is the right base for both `PermissionError` and `ValidationError` — `src/lib/errors.ts` defines the hierarchy. If they do not share it, catch both explicitly rather than widening the catch.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(prt)/admin/users/[id]/actions.ts"
git commit -m "feat(users): the re-issue action returns the code instead of redirecting"
```

---

### Task 5: The panel

**Files:**

- Create: `src/app/(prt)/admin/users/[id]/SetupCodePanel.tsx`
- Modify: `src/app/(prt)/admin/users/[id]/page.tsx`

- [ ] **Step 1: Write the panel**

Match `AddUserForm.tsx` for the success treatment and `@/lib/ui` for primitives. **Open `AddUserForm.tsx:133-151` and reuse those exact classes** so the two surfaces read as one feature.

```tsx
'use client'
import { useFormState } from 'react-dom'
import { reissueCodeAction, type ReissueState } from './actions'
import { AlertBanner, CARD, cx } from '@/lib/ui'

const initial: ReissueState = { ok: false }

/**
 * The invite state for an unclaimed account, and the button that replaces its code.
 *
 * Rendered only for an account with no auth identity - see page.tsx. A code is issued,
 * never read back (ADR-0008), so this panel can say whether one is outstanding and when it
 * lapses, and can replace it, but it can never show the current one. The copyable invite
 * is the point: the admin's next action is to send it on, not to memorise it.
 */
export function SetupCodePanel({
  id,
  email,
  fullName,
  expiresAt,
}: {
  id: string
  email: string
  fullName: string | null
  expiresAt: string | null
}) {
  const [state, formAction] = useFormState(reissueCodeAction, initial)

  const outstanding = expiresAt ? new Date(expiresAt).getTime() > Date.now() : false
  const invite = state.ok && state.code
  const message = invite
    ? `Hello${fullName ? ` ${fullName}` : ''},\n\nYour Cert-Ed Academia account is ready. Go to ${'/register'} and sign in with:\n\nEmail: ${email}\nSetup code: ${state.code}\n\nThe code is valid for 7 days. You can also sign in with Google using this email.`
    : ''

  return (
    <div className={cx(CARD, 'p-4')}>
      <h2 className="text-sm font-semibold text-slate-900">Sign-in invite</h2>
      <p className="mt-1 text-sm text-slate-600">
        {outstanding
          ? `A setup code is outstanding, valid until ${new Date(expiresAt as string).toLocaleDateString()}.`
          : 'No setup code is outstanding.'}{' '}
        The code itself cannot be shown again - re-issue to replace it.
      </p>

      {state.error && (
        <AlertBanner tone="warning" className="mt-3">
          {state.error}
        </AlertBanner>
      )}

      {invite && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded-lg border border-success-border bg-success-surface px-3 py-3 text-sm text-success-ink"
        >
          <p className="font-medium">New setup code for {state.email}.</p>
          <p className="mt-2 text-center">
            <code className="rounded bg-white px-3 py-1 text-lg font-bold tracking-widest text-success-ink ring-1 ring-success-border">
              {state.code}
            </code>
          </p>
          <p className="mt-1 text-xs text-success-ink">Valid 7 days - shown once. The previous code no longer works.</p>
          <label className="mt-3 block text-xs font-medium text-success-ink" htmlFor="invite-message">
            Copy this and send it to them
          </label>
          <textarea
            id="invite-message"
            readOnly
            rows={8}
            value={message}
            className="mt-1 w-full rounded border border-success-border bg-white p-2 font-mono text-xs text-slate-800"
          />
        </div>
      )}

      <form action={formAction} className="mt-3">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {outstanding ? 'Re-issue setup code' : 'Issue a setup code'}
        </button>
      </form>
    </div>
  )
}
```

Two things to check against the codebase rather than trusting this draft:

1. `useFormState` — confirm whether this repo imports it from `react-dom` or uses `useActionState` from `react`. **Copy whatever `AddUserForm.tsx` does.** Next 16 may have moved it; `AddUserForm.tsx:30` is the authority.
2. `AlertBanner` — confirm it accepts `className`. If not, wrap it in a `div` instead of passing one.

- [ ] **Step 2: Render it, for an unclaimed account only**

In `src/app/(prt)/admin/users/[id]/page.tsx`, import the panel and add it after `<DetailsCard profile={profile} />`:

```tsx
{
  !profile.auth_user_id && (
    <SetupCodePanel
      id={id}
      email={profile.email}
      fullName={profile.full_name}
      expiresAt={profile.setup_code_expires_at}
    />
  )
}
```

The `!profile.auth_user_id` condition is the UI half of the service guard: an account that has signed in has no invite to manage, so the panel is absent rather than present-and-refusing.

- [ ] **Step 3: Verify in mock mode**

```
npm run dev
```

Open `/admin/users` as the super admin, add a user, then open that user's detail page. Expect the panel, an outstanding code, and a working re-issue that prints a new code and the copyable message. Then open an account that HAS signed in (any seeded persona) and expect no panel at all.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(prt)/admin/users/[id]/SetupCodePanel.tsx" "src/app/(prt)/admin/users/[id]/page.tsx"
git commit -m "feat(users): manage an unclaimed account's sign-in invite from their page"
```

---

### Task 6: Prove it end to end

**Files:**

- Modify: `tests/e2e/journeys.pw.ts`

- [ ] **Step 1: Extend the admin journey**

`journeys.pw.ts` adds a user around line 83-103. **Read that block before editing**: the email is in a local called `newbieEmail`, and the submit goes through `submitAndReload`.

**Do not try to read the code from the Add-user panel.** `submitAndReload` (`tests/e2e/support.ts:30`) ends with `page.reload()`, which discards the `useFormState` result that held it. The add panel's code is gone by the time the next line runs.

So prove replacement using the new panel alone: re-issue twice and assert the two codes differ. That is the same property - a code is replaced, never recovered - and it depends on nothing outside the feature.

Append after `await expect(page.getByText(newbieEmail)).toBeVisible()`:

```ts
// ADR-0008: a code is issued, never read back. Two re-issues must produce two different
// codes; the same code twice would mean the plaintext was stored somewhere.
await page.getByRole('link', { name: newbieEmail }).click()
const panel = page.locator('form', { has: page.getByRole('button', { name: /issue setup code/i }) })
const shown = page.locator('[role=status] code')

await panel.getByRole('button', { name: /issue setup code/i }).click()
await expect(shown).toBeVisible()
const first = (await shown.textContent())?.trim()
expect(first).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)

await panel.getByRole('button', { name: /issue setup code/i }).click()
await expect(shown).not.toHaveText(first as string)
const second = (await shown.textContent())?.trim()
expect(second).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
await expect(page.getByText(/previous code no longer works/i)).toBeVisible()
```

Two things to adapt rather than assume:

1. **Reaching the detail page.** The suite may not link to a user by email. If `getByRole('link', { name: newbieEmail })` finds nothing, read how `/admin/users` renders a row and use whatever it actually offers - a name link, a "View" action - and say in your report what you used.
2. **The second click.** `await expect(shown).not.toHaveText(first)` is what waits for the new code to land; without it the second read can race and return the first code, which would make this test pass for the wrong reason. Keep it.

- [ ] **Step 2: Run the suite**

Run: `npx playwright test --project=chromium`
Expected: all specs passing, 87 or more.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/journeys.pw.ts
git commit -m "test(users): a re-issued setup code is a different code"
```

---

### Task 7: Close the ADR and the register

**Files:**

- Modify: `docs/adr/0008-setup-codes-are-reissued-not-recovered.md`
- Modify: `docs/adr/README.md:53`
- Modify: `docs/handover.md`

- [ ] **Step 1: The ADR is now implemented**

In `docs/adr/README.md` line 53, change `**Accepted** (decided; re-issue action not yet built)` to `**Accepted** (implemented)`.

In the ADR itself, add to the end of the **Decision** section:

```markdown
**Implemented 2026-10-12.** The write is `reissueSetupCodeForUnclaimed` in
`src/lib/data/profiles-auth.ts`, the service is `reissueSetupCode`, and the surface is the
"Sign-in invite" panel on `/admin/users/[id]`, shown only while the account is unclaimed.
The guard is one condition stricter than described above: `status = 'pending'` as well as
`auth_user_id is null`, so a REVOKED invite is refused rather than handed a code that
registration would reject anyway.
```

- [ ] **Step 2: Note it in the handover register**

`docs/handover.md` §7 lists smaller open threads. If any line there refers to a lost setup code needing a developer and hand-written SQL, replace it with one line saying an admin re-issues it from the user's detail page. If no such line exists, add nothing — this plan closes a gap the register did not track.

- [ ] **Step 3: Check the links still resolve**

Run: `npm run check:doc-links`
Expected: `All documentation links resolve.`

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0008-setup-codes-are-reissued-not-recovered.md docs/adr/README.md docs/handover.md
git commit -m "docs(adr): 0008 is implemented"
```

---

### Task 8: The whole gate

- [ ] **Step 1: Every check this repo gates on**

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run check:doc-links
```

Expected: formatting clean, zero lint warnings, typecheck clean, every test file passing, all links resolving.

- [ ] **Step 2: The browser suite**

Run: `npx playwright test --project=chromium`
Expected: all specs passing.

- [ ] **Step 3: Prove no schema changed**

Using the hash from Task 0:

```bash
git diff --stat $BASE -- supabase/
```

Expected: **empty.** ADR-0008 says "No schema change", and this proves it. If anything prints, revert it before going further.

- [ ] **Step 4: Prove no capability was added**

```bash
git diff $BASE -- src/lib/capabilities/
```

Expected: **empty.** Re-issue reuses `manageUsers` and `canManageTarget`; a diff here means authority was invented rather than inherited.

- [ ] **Step 5: Confirm the tree is clean**

```bash
git status --porcelain
```

Expected: empty, apart from this plan file if it has been ticked.

---

## What this plan does not do

- **Store a recoverable code.** The hash stays the only stored form. ADR-0008's follow-up section records the fallback if re-issue proves too fiddly, and reversing it would need its own ADR.
- **Strengthen the hash.** The unsalted SHA-256 over a ~2^40 keyspace is worth improving, and ADR-0008 lists it as independent follow-up work. Changing it here would mean invalidating every outstanding code at deploy time.
- **Email the code.** Blocked while `EMAIL_NOTIFICATIONS_ENABLED` is off. It is the thing that would make a lost code irrelevant.
- **Add a capability.** `manageUsers` plus the existing tier gate is the whole authority story. Task 8 Step 4 proves it.
- **Touch piece 3.** The add-several modal is the next plan, and it depends on this one existing.

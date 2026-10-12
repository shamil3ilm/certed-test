# Roles Relabelled — Implementation Plan (piece 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The five roles read Super Admin, Admin, Mentor, Tutor and Student everywhere a person can see them, with no stored identifier changed.

**Architecture:** `roleLabel()`/`personaLabel()` in `src/lib/ui/labels.tsx` are the single source of role wording. Four surfaces currently restate those strings and one renders the raw database value; this plan routes them all through the single source or fixes them in place, then adds a source-scanning test so the old wording cannot come back. No schema change, no migration, no change to any capability or authority rule.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest (jsdom), Playwright.

**Spec:** [docs/specs/2026-10-12-roles-relabel-and-bulk-user-add.md](../specs/2026-10-12-roles-relabel-and-bulk-user-add.md) — this plan implements piece 1 only. Pieces 2 (re-issue setup code) and 3 (add several users) get their own plans.

**The mapping this plan establishes** — stored identifier on the left, what a person reads on the right. `admin` already read "Super Admin" before this work; only the second tier changes.

| Tier   | Stored      | Reads                       |
| ------ | ----------- | --------------------------- |
| Top    | `admin`     | Super Admin                 |
| Second | `sub_admin` | **Admin** (was "Sub Admin") |
|        | `mentor`    | Mentor                      |
|        | `tutor`     | Tutor                       |
|        | `student`   | Student                     |

---

### Task 1: Flip the single source, and pin all five labels

**Files:**

- Modify: `tests/unit/ui-labels.test.ts:15` and `:51`
- Modify: `tests/unit/role-label-if-unexpected.test.ts:27`
- Modify: `src/lib/ui/labels.tsx:12-18` and `:112-125`

- [x] **Step 0: Record where you started, for the final check**

Task 8 proves this plan changed no stored identifier, which needs the commit you began from:

```bash
git rev-parse HEAD
```

Write that hash down. It is referred to below as `$BASE`.

- [x] **Step 1: Change the three existing assertions to the new wording, and add one that pins every label**

In `tests/unit/ui-labels.test.ts`, inside `describe('roleLabel')`, change the `sub_admin` line and add a second test after the existing one:

Replace the whole of `describe('roleLabel')` with a table, so a failure names the role that broke rather than reporting a positional diff — and so the five values are asserted once rather than in two tests that flip together:

```ts
describe('roleLabel', () => {
  // The academy's five role names, pinned. The stored identifiers deliberately do NOT match
  // the words - `admin` reads "Super Admin" and `sub_admin` reads "Admin" - so an edit that
  // "tidies" one of these would silently rename a tier for every user. A table rather than one
  // assertion per line, so a failure names the role that broke.
  it.each([
    ['admin', 'Super Admin'],
    ['sub_admin', 'Admin'],
    ['mentor', 'Mentor'],
    ['tutor', 'Tutor'],
    ['student', 'Student'],
  ])('labels %s as %s', (role, expected) => {
    expect(roleLabel(role)).toBe(expected)
  })

  it('falls back to Student for an unknown or absent role', () => {
    expect(roleLabel('nonsense')).toBe('Student')
    expect(roleLabel(null)).toBe('Student')
    expect(roleLabel(undefined)).toBe('Student')
  })
})
```

Do not write `.map(roleLabel)` anywhere here: `Array.map` passes `(value, index, array)`, which is harmless for a one-parameter function and a trap the day the signature grows.

In the same file, inside `describe('personaLabel')`, change the `sub_admin` expectation:

```ts
expect(personaLabel([persona('sub_admin')])).toBe('Admin')
```

In `tests/unit/role-label-if-unexpected.test.ts`, change the third expectation in `'names the role when it is NOT the expected one'`:

```ts
expect(roleLabelIfUnexpected('sub_admin', 'tutor')).toBe('Admin')
```

- [x] **Step 2: Run the two tests and watch them fail**

Run: `npx vitest run tests/unit/ui-labels.test.ts tests/unit/role-label-if-unexpected.test.ts`

Expected: FAIL — three assertions report `expected 'Sub Admin' to be 'Admin'`, and the new pinning test fails on the second element.

- [x] **Step 3: Flip the single source and record why the names differ from the identifiers**

In `src/lib/ui/labels.tsx`, replace the comment block and `roleLabel` (lines 4-18) with:

```tsx
/* Text labels and small status chips. These map a stored role / persona set to a
 * DISPLAY string only - the authorization meaning of a persona lives in
 * src/lib/capabilities, never here.
 *
 * THE WORDS DO NOT MATCH THE IDENTIFIERS, deliberately:
 *
 *     stored `admin`      reads "Super Admin"
 *     stored `sub_admin`  reads "Admin"
 *     stored `mentor` / `tutor` / `student`  read as themselves
 *
 * So `role === 'admin'` is the TOP tier, not the ordinary Admin a user sees. The identifiers
 * were left alone on purpose: renaming them means a Postgres enum rename (with an intermediate
 * name, because `admin` and `sub_admin` would collide), every RLS policy that names a tier, and
 * call sites throughout the app - a security-critical migration to buy a vocabulary change.
 * See docs/persona-model.md and docs/specs/2026-10-12-roles-relabel-and-bulk-user-add.md.
 *
 * This file is where the words are DECIDED. A few surfaces still spell a label themselves
 * because they need a plural or a persona-keyed record; prefer roleLabel/personaLabel. */

/** Display label for a profile's role (its fixed identity). Use for rows that
 *  carry a stored role - comment authors, the Users list - where loading personas
 *  per row would be an N+1. For the signed-in user prefer personaLabel, whose
 *  personas are already in the actor context. */
export function roleLabel(role?: string | null): string {
  if (role === 'tutor') return 'Tutor'
  if (role === 'mentor') return 'Mentor'
  if (role === 'admin') return 'Super Admin'
  if (role === 'sub_admin') return 'Admin'
  return 'Student'
}
```

In the same file, in `personaLabel`, change the `sub_admin` line:

```tsx
if (hasGlobal('sub_admin')) return 'Admin'
```

- [x] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/ui-labels.test.ts tests/unit/role-label-if-unexpected.test.ts`

Expected: PASS — all tests in both files.

- [x] **Step 5: Commit**

```bash
git add src/lib/ui/labels.tsx tests/unit/ui-labels.test.ts tests/unit/role-label-if-unexpected.test.ts
git commit -m "feat(roles): the second admin tier reads Admin, not Sub Admin"
```

---

### Task 2: The settings page states the label itself

`labelFromFlags` in the settings page-data loader restates the same wording from persona flags. Its own comment already says it must stay in step with `personaLabel`; it is about to fall out of step.

**Files:**

- Modify: `tests/unit/services/settings-page.test.ts`
- Modify: `src/lib/services/page-data/settings-page.ts:36`

- [x] **Step 1: Assert the new wording through the loader**

In `tests/unit/services/settings-page.test.ts`, add this fixture beside the existing `tutor` and `student` ones (after line 38):

```ts
const subAdmin = {
  id: 'sa-1',
  email: 'sa@x.c',
  full_name: null,
  role: 'sub_admin',
  status: 'active',
  class_level: null,
  auth_user_id: 'auth-sa',
} as any
```

and add this test inside `describe('loadSettingsPageData')`:

```ts
it('labels the second admin tier "Admin" - the same word the header uses', async () => {
  // labelFromFlags restates the wording instead of calling personaLabel, and its own comment
  // says the two must stay in step. This is the assertion that catches them drifting apart.
  vi.mocked(loadPersonaFlags).mockResolvedValueOnce({
    personas: [],
    isAdmin: false,
    isSubAdmin: true,
    isTutor: false,
    isManager: true,
    isStudent: false,
    isMentor: false,
  } as any)
  vi.mocked(getConsentStatus).mockResolvedValueOnce(CONSENT)
  const data = await loadSettingsPageData(subAdmin, {}, false)
  expect(data.roleLabel).toBe('Admin')
})
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/services/settings-page.test.ts`

Expected: FAIL — `expected 'Sub Admin' to be 'Admin'`.

- [x] **Step 3: Change the one string**

In `src/lib/services/page-data/settings-page.ts`, line 36:

```ts
if (flags.isSubAdmin) return 'Admin'
```

- [x] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/services/settings-page.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/services/page-data/settings-page.ts tests/unit/services/settings-page.test.ts
git commit -m "fix(settings): the identity label says Admin, matching the rest of the app"
```

---

### Task 3: The two messaging surfaces

Both keep their own label maps because they need plurals and a persona-keyed record. **One of them also has a pre-existing bug**: `MessagingMatrixForm` labels the top tier `'Admin'` rather than "Super Admin", so relabelling the second tier without fixing it would show two rows both reading "Admin".

**Files:**

- Modify: `src/app/(prt)/messages/NewMessageForm.tsx:11-17`
- Modify: `src/app/(prt)/admin/messaging/MessagingMatrixForm.tsx:16-22`
- Modify: `src/lib/messaging/recipient-policy-shared.ts:49`

- [x] **Step 1: Fix the three maps**

In `src/app/(prt)/messages/NewMessageForm.tsx`:

```tsx
const CONTACT_GROUP_LABELS: Record<Contact['personaKey'], string> = {
  admin: 'Super Admins',
  sub_admin: 'Admins',
  mentor: 'Mentors',
  tutor: 'Tutors',
  student: 'Students',
}
```

In `src/app/(prt)/admin/messaging/MessagingMatrixForm.tsx` — note `admin` changes too, so the matrix does not show two identical labels:

```tsx
const LABELS: Record<MessagingPersona, string> = {
  admin: 'Super Admin',
  sub_admin: 'Admin',
  tutor: 'Tutor',
  mentor: 'Mentor',
  student: 'Student',
}
```

In `src/lib/messaging/recipient-policy-shared.ts`, line 49:

```ts
if (hasGlobal('sub_admin')) return { personaKey: 'sub_admin', personaLabel: 'Admin' }
```

- [x] **Step 2: Run the messaging tests**

Run: `npx vitest run tests/unit/messaging`

Expected: PASS. If a test asserts `'Sub Admin'` or `'Sub Admins'`, change that expectation to `'Admin'` / `'Admins'` — it is asserting the old wording, which is the thing being changed.

- [x] **Step 3: Commit**

```bash
git add "src/app/(prt)/messages/NewMessageForm.tsx" "src/app/(prt)/admin/messaging/MessagingMatrixForm.tsx" src/lib/messaging/recipient-policy-shared.ts
git commit -m "fix(messaging): role groups read Super Admins and Admins"
```

---

### Task 4: Stop the Add-user dropdown showing database values

`AddUserForm` renders the raw option value, so the Role select reads `admin`, `sub_admin`, `tutor`. It is the only surface in the app that shows a stored value to a user.

**Files:**

- Modify: `tests/e2e/journeys.pw.ts` (near line 84, where the Add-user form is already located)
- Modify: `src/app/(prt)/admin/users/AddUserForm.tsx:46-48`

- [x] **Step 1: Assert the dropdown shows words, not identifiers**

In `tests/e2e/journeys.pw.ts`, immediately after the line that locates the Add-user form (`const add = page.locator('form', { has: page.getByRole('button', { name: 'Add user' }) })`), add:

```ts
// The Role select is the only place that ever rendered a raw stored value. A super admin may
// create every tier, so the words must be offered - and none of the identifiers. Asserts on
// TEXT, not value: the option values stay the stored identifiers, which the last line pins.
const roleSelect = add.locator('select[name=role]')
await expect(roleSelect).toContainText('Super Admin')
await expect(roleSelect).toContainText('Admin')
await expect(roleSelect).not.toContainText('sub_admin')
await expect(roleSelect.locator('option[value=sub_admin]')).toHaveCount(1)
```

- [x] **Step 2: Run that spec and watch it fail**

Run: `npx playwright test --project=chromium tests/e2e/journeys.pw.ts`

Expected: FAIL — the select contains `sub_admin`, and `not.toContainText('sub_admin')` rejects it.

- [x] **Step 3: Render the label, keep the value**

In `src/app/(prt)/admin/users/AddUserForm.tsx`, add `roleLabel` to the existing `@/lib/ui` import on line 4 — the barrel re-exports it, and components import from the barrel rather than the module:

```tsx
import { AlertBanner, CARD, cx, roleLabel } from '@/lib/ui'
```

Then change the option body (lines 46-48) so the value stays the stored identifier and only the text changes:

```tsx
{
  roles.map((r) => (
    <option key={r} value={r}>
      {roleLabel(r)}
    </option>
  ))
}
```

- [x] **Step 4: Run that spec and watch it pass**

Run: `npx playwright test --project=chromium tests/e2e/journeys.pw.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add "src/app/(prt)/admin/users/AddUserForm.tsx" tests/e2e/journeys.pw.ts
git commit -m "fix(users): the Add-user Role dropdown reads role names, not stored values"
```

---

### Task 5: A guard so the old wording cannot come back

The repo already keeps source-scanning invariant tests (`capped-reads`, `unbounded-reads`, `service-role-authority`). This is the same shape, and it is what makes "one place decides the words" true rather than aspirational.

**Files:**

- Modify: `src/lib/mock/seed.ts:108`
- Create: `tests/unit/role-labels-single-source.test.ts`

- [x] **Step 1: Rename the mock person first, because the guard scans `src/`**

In `src/lib/mock/seed.ts`, line 108:

```ts
        full_name: 'Sunil Admin',
```

Leave the id, the email (`subadmin@mock.test`) and `role: 'sub_admin'` alone — those are identifiers, not words a user reads.

- [x] **Step 2: Write the guard**

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { roleLabel } from '@/lib/ui/labels'

/**
 * No surface shows a user the retired tier name.
 *
 * The words and the stored identifiers deliberately disagree - `admin` reads "Super Admin",
 * `sub_admin` reads "Admin" - so a file that spells a label itself is a file that will one day
 * disagree with the rest of the app. That is exactly what happened before this guard existed:
 * six places restated the wording, and one of them called the TOP tier "Admin" while every
 * other surface called it "Super Admin".
 *
 * Scope, deliberately narrow:
 *
 *   - Only STRING LITERALS are checked. A comment may still say `sub_admin`, because that is
 *     the real identifier and prose about the stored value is correct.
 *   - Only the RETIRED DISPLAY FORMS are forbidden. A rule like "only these files may contain
 *     the word Students" was tried and flagged 18 files, because "Students" and "Tutors" are
 *     ordinary heading words. A guard that cries wolf gets deleted.
 *
 * What stops the five words drifting is the pinning test in tests/unit/ui-labels.test.ts.
 * This one stops the old wording reappearing where a person would read it.
 */
const SRC = join(process.cwd(), 'src')

/**
 * The retired display forms, inside a single- or double-quoted string.
 *
 * Two things this pattern gets right, both learned the hard way:
 *
 *   - CASE-INSENSITIVE. The first version required a capital S and sailed straight past a
 *     user-visible `PermissionError('Only an admin or sub-admin may record a session...')`.
 *     Prose inside a sentence is lower-case; only a standalone label is title-case.
 *   - The SEPARATOR IS REQUIRED — a space or a hyphen between "sub" and "admin". That is what
 *     distinguishes a word someone reads from an identifier nobody does: it flags "Sub Admin"
 *     and "sub-admin", and deliberately ignores `subadmin@mock.test`, `'u-subadmin'` and
 *     `sub_admin`, which are a fake address, a fixture id and the stored value.
 */
const RETIRED_IN_A_STRING = /'[^']*sub[ -]admins?[^']*'|"[^"]*sub[ -]admins?[^"]*"/i

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return files(full)
    return /\.(ts|tsx)$/.test(e.name) ? [full] : []
  })

describe('the role names stay distinct', () => {
  // The trap this nearly fell into: MessagingMatrixForm labelled the TOP tier "Admin", so
  // relabelling the second tier to "Admin" would have put the same word on two rows of one
  // matrix, with no way to tell which was which. Two tiers sharing a word is the failure that
  // matters, and it is cheapest to assert at the source.
  it('gives the five roles five different words', () => {
    const words = ['admin', 'sub_admin', 'mentor', 'tutor', 'student'].map((r) => roleLabel(r))
    expect(new Set(words).size).toBe(words.length)
  })
})

describe('the retired tier name is not shown to anyone', () => {
  it('no string literal under src/ says "Sub Admin"', () => {
    const offenders = files(SRC)
      .filter((f) => RETIRED_IN_A_STRING.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split(sep).join('/'))
    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These show a user the retired tier name. The second tier reads "Admin" now, and\n` +
            `lib/ui/labels.tsx is the one file that decides the words:\n` +
            offenders.map((o) => `  - ${o}`).join('\n'),
    ).toEqual([])
  })
})
```

- [x] **Step 3: Run it**

Run: `npx vitest run tests/unit/role-labels-single-source.test.ts`

Expected: PASS. Before this plan there were exactly seven offending string literals — `ui/labels.tsx:16`, `:119`, `settings-page.ts:36`, `NewMessageForm.tsx:13`, `MessagingMatrixForm.tsx:18`, `recipient-policy-shared.ts:49` and `mock/seed.ts:108` — and Tasks 1, 2, 3 and this task's Step 1 remove all seven. If it fails, it is naming a file one of those steps missed.

- [x] **Step 4: Prove the guard actually fails**

A guard that has never failed is decoration. Temporarily add `const retired = 'Sub Admin'` to `src/lib/ui/core.ts`, run the test, confirm it fails and names `lib/ui/core.ts`, then remove the line and re-run to green.

- [x] **Step 4b: Now the claim is true, make the comment say it**

Task 1 deliberately left `src/lib/ui/labels.tsx` claiming only that the words are _decided_ here, because at that point four surfaces still spelled them and this guard did not exist. Both are now resolved, so replace the closing two lines of that comment block:

```
 * This file is where the words are DECIDED. A few surfaces still spell a label themselves
 * because they need a plural or a persona-keyed record; prefer roleLabel/personaLabel. */
```

with:

```
 * This file decides the words. A surface that needs a plural or a persona-keyed record keeps
 * its own map - NewMessageForm, MessagingMatrixForm, recipient-policy-shared, settings-page -
 * and tests/unit/role-labels-single-source.test.ts fails if the retired wording returns to any
 * string literal under src/. */
```

- [x] **Step 5: Commit**

```bash
git add tests/unit/role-labels-single-source.test.ts src/lib/mock/seed.ts src/lib/ui/labels.tsx
git commit -m "test(roles): the retired tier name cannot come back"
```

---

### Task 6: The developer note

**Files:**

- Modify: `docs/persona-model.md` (after the `# Persona model` heading, before `## 1. Two-layer model`)
- Modify: `src/lib/services/users/admin-lifecycle.ts:32-40`

- [x] **Step 1: Put the mapping where a developer meets the model**

In `docs/persona-model.md`, insert immediately after the opening heading and its intro paragraph:

```markdown
## The words and the identifiers disagree

What a person reads is not what the database stores, and the difference is load-bearing:

| Tier   | Stored identifier | What a person reads |
| ------ | ----------------- | ------------------- |
| Top    | `admin`           | **Super Admin**     |
| Second | `sub_admin`       | **Admin**           |
|        | `mentor`          | Mentor              |
|        | `tutor`           | Tutor               |
|        | `student`         | Student             |

So `role === 'admin'` is the TOP tier, not the ordinary Admin a user sees, and the tier a user
calls "Admin" is `sub_admin` in every column, enum, RLS policy and type. The identifiers were
deliberately not renamed: it would need a Postgres enum rename with an intermediate name
(`admin` and `sub_admin` collide), 86 RLS policy references and ~1300 occurrences across the
codebase — a security-critical migration to buy a vocabulary change.

`src/lib/ui/labels.tsx` is the only file that knows the words, and
`tests/unit/role-labels-single-source.test.ts` fails if another one learns them.
```

- [x] **Step 2: Reword the three comments that describe the tier by its retired name**

In `src/lib/services/users/admin-lifecycle.ts`, replace lines 32-40 with:

```ts
// User management: the roles the Admin tier (stored as `sub_admin`) may create/manage - every
// non-admin staff / student account (tutor, mentor, student). The admin tier itself stays a
// Super Admin responsibility, so a `sub_admin` can never create or act on another admin.
const SUB_ADMIN_MANAGEABLE = new Set(['tutor', 'mentor', 'student'])

/** An Admin (`sub_admin`) may only act on tutor/mentor/student accounts; a Super Admin
 *  (`admin`) on anyone. Exported so the READ surfaces (the user-detail page) gate on the same
 *  tier rule the writes here enforce - otherwise a `sub_admin` could open an admin-tier or
 *  mentor profile and read its personal detail even though every write is refused. */
```

The constant keeps its name: renaming `SUB_ADMIN_MANAGEABLE` would be the identifier rename this plan exists to avoid.

- [x] **Step 3: Check the docs still link up**

Run: `npm run check:doc-links`

Expected: `All documentation links resolve.`

- [x] **Step 4: Commit**

```bash
git add docs/persona-model.md src/lib/services/users/admin-lifecycle.ts
git commit -m "docs(roles): record that the words and the stored identifiers disagree"
```

---

### Task 7: The staging suites' stale wording

**Files:**

- Modify: `tests/staging/personas.staging.pw.ts:48`
- Modify: `tests/staging-workflows/05-admin.workflow.pw.ts:22`

- [x] **Step 1: Rename the describe block**

In `tests/staging/personas.staging.pw.ts`, line 48:

```ts
test.describe('staging - Admin', () => {
```

Leave the `'subadmin'` persona key passed to `landsOnDashboard` alone — that is a fixture identifier, not a word anyone reads.

- [x] **Step 1b: Fix the header comment that now contradicts its own test**

`tests/staging-workflows/05-admin.workflow.pw.ts:22` reads "A sub-admin is offered only the roles they may create." Task 4 renamed the test below it to "an Admin may create only students, tutors and mentors", so the file header now describes a tier by a name the test no longer uses. Change it to:

```
 * An Admin is offered only the roles they may create.
```

**Deliberately left alone** in both staging suites: code comments, `console.log` labels, and the string arguments to `expect(..., 'message')` that are assertion failure messages. A sweep found ten such hits across three files; none is an asserted value, so none can fail a run, and rewording them all is cosmetic churn beyond what this work needs. The two changes above are made because each is a _title or header_ that now disagrees with the test it describes.

- [x] **Step 2: Run the suites that read the renamed fixture**

Run: `npm test`

Expected: PASS, all files. If a test asserted the old fixture name "Sunil Sub-Admin", update that assertion to `'Sunil Admin'`.

- [x] **Step 3: Commit**

```bash
git add tests/staging/personas.staging.pw.ts tests/staging-workflows/05-admin.workflow.pw.ts
git commit -m "test(roles): the staging suite names the Admin tier"
```

---

### Task 8: The whole gate

- [x] **Step 1: Run every check this repo gates on**

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run check:doc-links
```

Expected: formatting clean, zero lint warnings, typecheck clean, all test files passing, all documentation links resolving.

- [x] **Step 2: Run the browser suite**

Run: `npx playwright test --project=chromium`

Expected: all specs passing. A failure here is most likely a spec asserting the retired wording — change the assertion, not the label.

- [x] **Step 3: Confirm nothing stored changed**

Using the hash recorded in Task 1 Step 0:

```bash
git diff --stat $BASE -- supabase/
git diff $BASE -- src/lib/auth/profile.ts src/lib/permission/personas.ts src/lib/capabilities/
```

Expected: **both empty.** This plan changes no migration, no enum value, no persona name and no capability. If either prints anything, something has strayed outside piece 1 and should be reverted before going further.

- [x] **Step 4: Commit anything outstanding**

```bash
git status --porcelain
```

Expected: empty. If not, commit the remainder with a message naming what it is.

---

## What this plan does not do

- **Rename any stored identifier.** `sub_admin` stays `sub_admin` in the database, the enums, the 86 RLS policy references and every TypeScript type. Task 8 Step 3 proves it.
- **Change any authority.** No capability is added, removed or re-scoped. Who may create or manage whom is exactly as before.
- **Touch pieces 2 or 3.** The re-issue action and the add-several modal have their own plans.

---

## What shipped, and where it differed from this plan

Executed 2026-10-12 in eight commits, `d175d97` through `f5297a0`. The gate ran clean at the end:
formatting, zero lint warnings, typecheck, 232 test files / 1980 unit tests, 86/86 Playwright
chromium specs, and all documentation links resolving. `git diff` against the branch point is
empty for both `supabase/` and the identifier files, which is the proof that this stayed a
relabel.

Three places the shipped work is deliberately not what the task text above prescribed, each
recorded because the plan was wrong rather than the implementation:

1. **Task 5's scanner strips comments, and its quoted arms stop at a newline.** The pattern for
   the retired forms is unchanged, but as written the scan flagged twelve files, every one a
   docstring correctly describing the stored `sub_admin` tier. Two causes: nothing removed
   comments, and `[^']*` crosses newlines, so an apostrophe in ordinary prose (`a student's
classes`) opens a pseudo-literal that runs on until it swallows a nearby docstring. The
   shipped test removes comments first and bounds the `'`/`"` arms with `[^'\n]`, which a real
   literal cannot contain anyway; a third arm covers template literals, which legitimately span
   lines. A vacuity check that the walk reads any files at all was added alongside.

2. **Task 6's JSDoc does not say "or mentor".** The prescribed replacement claimed a `sub_admin`
   is refused writes to "an admin-tier or mentor profile". `SUB_ADMIN_MANAGEABLE` contains
   `mentor`, and `tests/unit/services/admin-lifecycle-tier.test.ts` asserts
   `canManageTarget(subAdmin, 'mentor')` is true, so the clause was false. The shipped comment
   names the admin tier only.

3. **Task 7 commits two files, not one.** Step 1b edits a second file that Step 3's `git add`
   never listed.

One fix outside the plan's scope rode along in `01d6c61`: `.gitignore` covered
`playwright-report/` and `playwright-report-staging/` but not
`playwright-report-staging-workflows/`, so listing or running that third suite left an untracked
report folder in the tree.

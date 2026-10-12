# Roles relabelled, and adding several users at once

- **Date:** 2026-10-12
- **Status:** Designed, not built. Three pieces, to be built in the order below.

## Context

The academy's five roles should read **Super Admin, Admin, Mentor, Tutor, Student**. Today the second tier reads "Sub Admin", which is internal vocabulary nobody outside the codebase uses. Separately, the Add-user dropdown shows raw database values (`admin`, `sub_admin`), and there is no way to add more than one person at a time — a start-of-term intake means repeating a form.

Three pieces follow, deliberately sequenced. Piece 1 is independent and can ship alone. Piece 2 must land before piece 3, because adding several users at once multiplies the one problem [ADR-0008](../adr/0008-setup-codes-are-reissued-not-recovered.md) was written about: a one-time setup code shown once, lost when the panel closes, recoverable only by a developer running SQL.

## The decision that shapes everything: labels, not identifiers

**Stored identifiers do not change.** `admin` stays `admin`, `sub_admin` stays `sub_admin`, in the database, the Postgres enums, the RLS policies and the TypeScript types. Only what a person reads changes.

Renaming the identifiers was considered and rejected on cost. `sub_admin` appears 480 times across 133 files; the other half of a consistent rename, `admin` → `super_admin`, is 827 occurrences across 157 files and **86 RLS policy references**. It needs a Postgres enum rename that cannot be done in one step — `admin`→`super_admin` and `sub_admin`→`admin` collide, so an intermediate name is required — on a live production database that is currently four migrations behind. That is a security-critical migration bought for a vocabulary change.

**The cost of this decision, stated plainly, because it is a trap:** after relabelling, the word "admin" means different tiers in the two vocabularies.

| Tier   | Stored identifier | What a person reads |
| ------ | ----------------- | ------------------- |
| Top    | `admin`           | **Super Admin**     |
| Second | `sub_admin`       | **Admin**           |
|        | `mentor`          | Mentor              |
|        | `tutor`           | Tutor               |
|        | `student`         | Student             |

A developer reading `role === 'admin'` may reasonably think "the ordinary Admin tier" when it is the top tier. Half of that mismatch exists already — the labels have said "Super Admin" for `admin` for some time — and this work completes it by introducing a user-facing "Admin" that is not `admin` in code.

Three guards, all part of piece 1: every surface renders labels through one helper, a test pins all five labels, and the table above is written where developers will meet it.

---

## Piece 1 — Relabelling

### One place decides the words

`roleLabel()` and `personaLabel()` in `src/lib/ui/labels.tsx` change `'Sub Admin'` to `'Admin'`. `admin` already returns "Super Admin", so no change is needed there.

### Four surfaces bypass that helper and must stop

These are why a rename "misses" places:

| File                                                       | Says today     | Becomes    |
| ---------------------------------------------------------- | -------------- | ---------- |
| `src/lib/services/page-data/settings-page.ts:36`           | `'Sub Admin'`  | `'Admin'`  |
| `src/app/(prt)/messages/NewMessageForm.tsx:13`             | `'Sub Admins'` | `'Admins'` |
| `src/app/(prt)/admin/messaging/MessagingMatrixForm.tsx:18` | `'Sub-admin'`  | `'Admin'`  |
| `src/lib/messaging/recipient-policy-shared.ts:49`          | `'Sub Admin'`  | `'Admin'`  |

Where a plural or a different grammatical form is needed, the string is updated in place; where the singular label will do, the call routes through `roleLabel`.

### The Add-user dropdown

`src/app/(prt)/admin/users/AddUserForm.tsx:46-48` renders `{r}` — the raw stored value — so the dropdown reads `admin`, `sub_admin`, `tutor`. It becomes `{roleLabel(r)}`, reading "Super Admin", "Admin", "Tutor", "Mentor", "Student". The `value` attribute keeps the stored identifier, so nothing about submission changes.

This is the only surface in the app that shows a database value to a user, so it is worth fixing on its own merit.

### No change needed

`ROLE_FILTERS` in `src/lib/services/page-data/admin-users.ts:34` already has a single `admin` tab labelled "Admins" that covers both tiers, so the People page role strip is already correct.

### The developer note

Two places, same table as above:

1. A comment at the label map in `src/lib/ui/labels.tsx`, stating the mapping and why the identifiers were not renamed.
2. The same table in `docs/persona-model.md`, the canonical persona doc.

Three developer-facing comments describe the tier by its old name and would read as describing something that no longer exists: `src/lib/services/users/admin-lifecycle.ts:32`, `:37` and `:67`. They are reworded to the new vocabulary while naming the stored value, e.g. "the Admin tier (stored as `sub_admin`)".

### Also in scope

- `src/lib/mock/seed.ts:108` — the fixture named "Sunil Sub-Admin" becomes "Sunil Admin".
- `tests/staging/personas.staging.pw.ts:48` — the describe block "staging - Sub Admin".

**Not in scope, because there is nothing to do:** the living docs under `docs/` already refer to the tier by its stored identifier (`sub_admin`) rather than by a display name, which stays correct after this change. Only `docs/persona-model.md` gains the mapping table described above.

### Tests

- `tests/unit/ui-labels.test.ts:15,51` and `tests/unit/role-label-if-unexpected.test.ts:27` expect `'Sub Admin'` — updated to `'Admin'`.
- A new assertion pinning all five labels exactly: Super Admin, Admin, Mentor, Tutor, Student. A future edit then cannot drift one of them silently.

---

## Piece 2 — Re-issue a setup code

A straight implementation of [ADR-0008](../adr/0008-setup-codes-are-reissued-not-recovered.md), which decided this in full. Nothing here re-opens that decision.

- A per-user action on the user detail page, `src/app/(prt)/admin/users/[id]/`.
- The write is scoped to `auth_user_id is null`, so it refuses an account that has already signed in rather than quietly resetting a live user. The previous code stops working; that is the intent.
- Gated by the existing `canManageTarget(actor, role)` — the same gate `addUser` applies — so an Admin may re-issue for a tutor, mentor or student and not for a Super Admin. No new capability is introduced.
- Whether a code is outstanding, and when it expires, is shown from `setup_code_expires_at`, which is already stored.
- On success it returns the complete copyable invite: name, email, code, the `/register` link and the expiry — so the natural next action is to send it on.
- Audited as `user.reissue_code`.
- **No schema change.** `setup_code_hash` and `setup_code_expires_at` already carry everything needed.

### Tests

- Refuses a claimed account (`auth_user_id` set), and does not alter the stored hash when it refuses.
- Refuses an actor who may not manage that role, reusing the existing `canManageTarget` fixtures.
- On success, the stored hash changes and the old code no longer validates.
- Writes one `user.reissue_code` audit row.

---

## Piece 3 — Adding several users at once

### Entry point

A second control beside the existing Add-user disclosure on the People page — "Add several" — opening a modal. The single form is unchanged and remains the place for full detail (phone, guardian, joined-on); the batch form deliberately captures less.

### The row

Each row carries **Role, Email, Name**, plus only what its role requires. A student is heavier than the others because `addUserSchema` (`src/lib/validation/user.ts:57-66`) requires country and class/grade for students, and `validateAddUserInput` requires a mentor:

| Role chosen                       | Extra fields in that row     |
| --------------------------------- | ---------------------------- |
| Student                           | Country, Class/grade, Mentor |
| Tutor, Mentor, Admin, Super Admin | none                         |

Role options per row come from the same `creatable` list the single form uses (`src/lib/services/page-data/admin-users.ts:208`), so an Admin simply has no Admin or Super Admin option. Authority is inherited, not restated.

A "copy down" control on Country, Class/grade and Mentor, because a cohort usually shares all three.

**Cap: 25 rows per batch.** Enough for a cohort, small enough that 25 codes still fit on one screen to copy, and it stops a paste of 500 becoming 500 sequential writes.

### Two phases

**Check** validates every row before anything is written:

- each row against the existing `addUserSchema`;
- no duplicate email within the batch;
- no email already in use;
- no role this actor may not create.

If anything fails, nothing is written and the offending rows are marked inline with their reason.

**Create** then calls the existing `addUser` once per row, in sequence. Nothing about `addUser`, `create_invited_profile` or the capability gate changes — the batch is a caller, not a second path.

A fully atomic batch was considered and rejected: it would need a new Postgres function taking an array, which means a migration, a regenerated snapshot, and re-running privilege parity and the RLS suite, duplicating `create_invited_profile`'s logic in a second function that must then be kept in step. The failure it protects against is an email race between check and create, which upfront validation makes rare and whose consequence — some rows created, the rest not — is visible in the results table and fixable by resubmitting the remainder.

### The results table is the feature

One row per created account: name, email, role, the one-time code, and its expiry. Plus **Copy all** and **Download CSV**, and per ADR-0008 a copyable invite message per row.

If a row fails during create — realistically only the email race — that row shows its reason and the successful rows keep their codes. Because piece 2 exists, a code lost at this point costs a click rather than a developer.

### Tests

- Batch validator: duplicate email within the batch; email already taken; a student row missing country, class/grade or mentor; a role the actor may not create.
- A service test that a mid-batch failure leaves the earlier rows created and reports the remainder, rather than throwing and losing the outcome.
- An E2E that adds three mixed rows and asserts three codes appear with the right roles.

---

## Out of scope, deliberately

- **Renaming stored identifiers.** Rejected above, with the numbers. Revisit as its own project if the code/label mismatch proves to cause real confusion.
- **CSV paste or upload.** Mixed roles typed in is the stated need; paste needs its own parsing, preview and error model. Worth a second pass once the modal is in use.
- **Emailing setup codes.** ADR-0008 records this as blocked while email is deferred, and it is the thing that would make a lost code irrelevant. Revisit when `EMAIL_NOTIFICATIONS_ENABLED` is on.
- **Any change to authority.** No capability is added, removed or re-scoped by any of the three pieces. Who may create or manage whom is exactly as it is today.

## Verification

The existing gate covers all three pieces, and must stay green: `format:check`, `lint`, `typecheck`, the unit suite, the Playwright E2E suite, the RLS suite and privilege parity. No migration is introduced, so the snapshot and the migration checklist are untouched.

Because piece 1 changes strings that tests assert on, run the unit suite before the E2E suite — a missed label assertion is cheaper to find there.

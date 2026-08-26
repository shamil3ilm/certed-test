# Production Security Re-Audit (Round 3) — Cert-Ed Academia

**Date:** 2026-08-25
**Target:** `feature/cert-ed-academia-app` — HEAD `5e23697`
**Prior rounds:** [2026-08-20 audit](./2026-08-20-security-audit.md) @ `2bda9c0` · [2026-08-25 re-audit](./2026-08-25-security-reaudit.md) @ `4ab16dd`
**Delta:** 10 commits · 37 source files · migrations `0077`–`0079` · new feature: **mentee notes** (0078); **consents** gained a service layer
**Build state verified by me:** `vitest run` → **1161 passed / 153 files** (up from 1154/150).

`/claude-security` is still not installed; Claude Code's built-in `security-review` skill was run in its place as **Audit A**. **Audit B** is my own reading of the source.

---

## 1. The headline: A-07 is genuinely closed

This was my top blocking item across two rounds, and `0079` fixes it properly. I verified every affected policy in the end-state snapshot, not the migration's comment:

| Table             | Write policy                            | Read policy                        |
| ----------------- | --------------------------------------- | ---------------------------------- |
| `announcements`   | `teaches_class_write` ✅                | `teaches_class` (mentor read kept) |
| `assignments`     | `teaches_class_write` ✅                | `teaches_class`                    |
| `resources`       | `teaches_class_write` ✅                | `teaches_class`                    |
| `meet_links`      | `teaches_class_write` ✅                | `teaches_class`                    |
| `calendar_events` | `teaches_class_write` ✅                | `teaches_class`                    |
| `timetable_slots` | `teaches_class_write` ✅                | `teaches_class`                    |
| `attendance`      | `teaches_class` — **deliberately kept** | `teaches_class`                    |
| `class_sessions`  | `teaches_class` — **deliberately kept** | `teaches_class`                    |

`teaches_class_write()` is the tutor branch without `or mentors_class(...)`. The two tables that retain the mentor clause are exactly the two the `manageAttendance` capability declares. The migration's riskiest move — narrowing three `FOR ALL` policies that previously also covered `SELECT` — is safe because each of those tables has a separate `_read` policy that still admits mentors, and permissive policies OR for `SELECT`. I checked all three. **The database now agrees with the application's stated intent.**

---

## 2. Verified fixed this round

Each re-derived from current code, not from a claim.

| ID                                | Verified                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A-07**                          | **FIXED** (with a residual) | `0079` + all 8 policy pairs above. Residual: `attendance_write` and `class_sessions_write` are `FOR ALL`, so the retained mentor clause also grants **DELETE** — and, under R-01, `UPDATE` on `staff_note`/`summary`, which the app deliberately withholds from mentors. The DB is broader than the capability it mirrors.                                                                                                                                                            |
| **R-02**                          | **PARTIAL** ⚠               | `client.ts:41` passes `{ cookieOptions: { secure, maxAge: MAX_SESSION_SECONDS } }` — but `@supabase/ssr` `dist/main/cookies.js:202-206` builds `setCookieOptions` as `{...DEFAULT_COOKIE_OPTIONS, ...options?.cookieOptions, maxAge: DEFAULT_COOKIE_OPTIONS.maxAge}` — a **hard override after the spread**. `secure` survives; **`maxAge` is silently discarded and reverts to 400 days.** The 30-day ceiling therefore applies only once a server-side refresh rewrites the cookie. |
| **R-03**                          | **PARTIAL** ⚠               | Actor threaded (`page.tsx:11`), search clamped (`history.ts:76`), and the admin-tier label masked (`:108-109`) — the admin oracle is genuinely closed. But `:111` is still `actor.full_name ?? actor.email`, so a `viewHistory`-override holder continues to harvest **student and tutor** emails. Only the admin tier was redacted; the cross-tier PII class was not.                                                                                                                |
| **R-07**                          | **PARTIAL** ⚠               | Helper fully repaired — `ilike.ts:8` strips `*` and escapes `[\\%_]` in one pass. But `data/messages-rows.ts:46` is still a raw `.ilike('body', \`%${query}%\`)`fed the untrusted`?q=`. Bounded (participant-gated, URL-encoded, so widening only), but it is the exact site the finding named.                                                                                                                                                                                       |
| **R-09 / R-10**                   | **PARTIAL** ⚠               | Guardians half **fixed** — `guardians.ts:35-36` `requireManageableTarget`; `:62`,`:68` `validateUuidField`. But `getManagerSession` (`sessions.ts:176-178`) is unchanged: no actor, bare service-role read of the deliberately-ungranted `staff_note`, safety delegated to the caller by comment only.                                                                                                                                                                                |
| **R-12**                          | **FIXED** (3 of 3)          | `0077` adds `REVOKE ALL … FROM PUBLIC` to `mentors_class`, `finance_totals_base`, `set_updated_at`; the last also gains `SET search_path`. Immediately re-broken by `0079` — see N-08.                                                                                                                                                                                                                                                                                                |
| **R-15**                          | **FIXED**                   | `attachments/route.ts:157,160` — both catches now take a handler instead of `() => {}`.                                                                                                                                                                                                                                                                                                                                                                                               |
| **A-06**                          | **PARTIAL → MEDIUM**        | `secure` in production now applies on all three write paths. The 30-day cap holds server-side only (see R-02). `httpOnly:false` remains, documented as an accepted risk backed by the nonce CSP.                                                                                                                                                                                                                                                                                      |
| **A-08 residual**                 | **NOT FIXED**               | `admin/users/[id]/page.tsx:21` still reads the full PII row _before_ the `canManageTarget` check at `:27`. No disclosure (both cases 404), but the ordering defect is untouched.                                                                                                                                                                                                                                                                                                      |
| **Attendance (my round-2 §6 #1)** | **MOOT**                    | `clearAttendanceAction` now requires `manageClassContent`, so the destructive bulk delete is no longer reachable by a mentor. `staff_note` is fail-closed — `canEditStaffNote` defaults `false` and the field is **omitted from the upsert entirely** when absent, so an existing note is preserved rather than blanked.                                                                                                                                                              |

Also strong: `tests/unit/rls-coverage-parity.test.ts` is a real structural gate (parses `enable row level security` out of every migration, fails CI if a table is neither asserted in `test-rls.sh` nor on a shrink-only exempt list), and `test-rls.sh` gained **6 negative-authorization write assertions** — including one that directly tests the `0079` split. That converts "keep the harness current" into a mechanical gate.

---

## 3. New findings

### HIGH

**N-01 — Every consent record asserts facts no user signal ever produced.**
`src/lib/services/consents.ts:16-24`

```ts
guardian_consent: opts.guardianConsent ?? false,
cross_border_consent: true,
jurisdiction: opts.jurisdiction ?? null,
```

The sole caller is `registration.ts:73` — `recordConsentAcceptance(target.id)` — which passes **no options**. Therefore, on every row that will ever exist: `guardian_consent = false`, `jurisdiction = null`, `cross_border_consent = true`. The docstring says guardian consent is "captured by the caller when known"; no caller captures it, and no form collects it — registration takes email, code, password only, and the `guardians` table has no consent column.

Meanwhile `src/app/(mkt)/privacy/page.tsx:76-80` states the lawful basis outright:

> "Students are typically minors, so we process their data on the basis of a **parent or guardian's consent**."

So the append-only consent log — the artefact the academy would produce as evidence — contradicts its own published lawful basis on **every single row**, and records the acceptance as having been made by the child, via a setup code. A field that is always `false` is worse than an absent field: it converts an unrecorded fact into a recorded negative.

Compounding it, the comment justifying `cross_border_consent: true` is factually wrong about the document it cites. `consents.ts:9` says the policy "discloses that data is held in **Singapore**"; `privacy/page.tsx:101` says data is "stored and processed in **India**", and `:103` adds that the legal basis for transfers is _"being finalised with legal counsel before this policy takes effect."_ The code stamps settled consent derived from a disclosure that names a different country and says on its face that the basis is undetermined. (I grepped: the only other "Singapore" in the repo is a country-list entry.)

**Fix:** capture guardian acceptance at intake — the admin creating the profile already collects guardian contacts — and pass it through; derive minority from `date_of_birth` and make it mandatory for minors. Write `cross_border_consent: false` (or `null`) until the policy text makes an affirmative disclosure the user accepts. Correct the Singapore comment either way.

---

### MEDIUM

**N-02 — `mentee_notes` is absent from the RLS alarm list, and RLS is its _only_ boundary.**
`src/lib/services/queue-health.ts:27-51`

The list was extended this round with a block commented _"Newest PII / authority tables whose read boundary is RLS-only — include them so a disabled-RLS misconfiguration is caught here too (they were missing before)"_, adding `guardians`, `consents`, `capability_overrides`, `persona_assignments`, `class_tutors`, `audit_log`. I grepped: **`mentee_notes` is not there** (count = 0) — introduced two migrations later and the single most sensitive table in the schema.

It matters more here than for the others. `mentee_notes` has **no column grants and no `REVOKE`**, so it inherits Supabase's default `GRANT ALL … TO anon, authenticated`. If RLS is ever off — a restore, a debugging `disable row level security`, a partial migration — the **public anon key shipped in the browser bundle** can select, insert, update and delete every pastoral note about every child. `assessQueueHealth` would report healthy throughout.

Note it _is_ covered by the separate `test-rls.sh` harness; the gap is specifically the runtime alarm. Two lists, one covered, one missed — second occurrence of this exact miss.

**N-03 — Pastoral notes widen access on mentor handover.**
snapshot `:3662` — `mentee_notes_read … USING (is_active_admin() OR mentors_student(student_id))`

The policy keys on the _current_ relationship, not authorship or period. Combined with append-only (no delete, ever), a new mentor inherits the outgoing mentor's entire file on first page load. A tutor later given a mentorship gains a subjective psychological file on a pupil they only teach. The migration header and the UI both call the notes "private to the mentor"; they are private to _the role_, permanently.

**N-04 — No erasure or rectification path for a minor's most sensitive record.**
`0078:30-31` omits every write policy by design, and no update/delete function exists in either layer. The `ON DELETE CASCADE` on `student_id` is unreachable in practice: the only profile delete is guarded to unclaimed rows (`profiles-directory.ts:224`, `.is('auth_user_id', null)`), and real accounts are revoked, not deleted. `privacy/page.tsx:124-130` promises a guardian may "access, correct, or **erase**" the child's data. For an inaccurate or defamatory note, that promise cannot be met without direct DB access — which has no audit trail. Append-only is right for an audit log and wrong for subjective third-party opinion about a child, which specifically carries a rectification right.

**N-05 — Reads of a child's pastoral file are not audited.**
`mentee-notes.ts:17-20` — `addMenteeNote` audits; `listMenteeNotes` does not. Every admin holds `canMentor` unconditionally (`mentor.ts:17`), so an admin can open any child's file at `/students/<uuid>` with no record. This is the one table where _reading_ is the sensitive act, and an admin browsing arbitrary children's notes is precisely the abuse worth detecting. A later "who read my child's file?" is unanswerable.

**N-06 — Consent write is fire-and-forget, and nothing ever reads the table.**
`registration.ts:73-75` — `await recordConsentAcceptance(…).catch(e => console.error(…))`, then `return { ok: true }`. No retry, no queue, no reconciliation. And `src/lib/data/consents.ts` exports only `insertConsent` — there is **no select anywhere**, so no process would ever notice a gap. A transient failure during an intake batch yields active accounts processing minors' data with no evidence of lawful basis, and no way to enumerate which. Separately: the profile — including DOB and guardian contacts — is created by an admin _before_ the child registers, so processing begins before any consent row exists.

**N-07 — Withdraw-consent and re-acceptance are promised but unimplemented.**
The schema has no `withdrawn_at`; nothing compares a stored `terms_version` against `versions.ts`. Bumping `POLICY_EFFECTIVE_DATE` silently leaves every existing user un-re-consented and undetectable. The `consents_read` RLS policy correctly grants a person read access to their own history — and no UI or route ever exercises it.

---

### LOW

**N-08 — R-12 regressed in the same batch that fixed it.** `0077` added the missing `REVOKE ALL … FROM PUBLIC` to three functions; `0079` created `teaches_class_write` with a `GRANT` and no `REVOKE`. I enumerated every function in the snapshot: **it is now the only one missing it.** Impact is nil (it keys off `auth.uid()`, so `anon` always gets `false`) — but three instances were fixed by hand and a fourth was created in the same release. The `0034` invariant still isn't mechanically enforced, so it will keep recurring. This is the strongest argument yet for the CI assertion recommended last round.

**N-13 — `0079` broke the app-layer guard it was mirroring, and its comment now asserts the opposite.**
`src/lib/permission/class-write.ts:16-30`

`canWriteClass` still grants mentors (`if (hasMentorAuthority && (await mentorAuthorityClassIds(...)).has(classId)) return true`), while `calendar_events_write` and `timetable_slots_write` — the two tables it guards, both written through the **RLS-scoped** client — now gate on the tutor-only `teaches_class_write`. The guard's own RLS NOTE says:

> "the row-level policies across class-scoped tables gate on the same `teaches_class` function this guard mirrors, so the app-side check and the row-level policy **agree by construction**."

They no longer do. It fails _closed_, so this is not an escalation — but `capabilities/index.ts:119` documents the administrative remedy _"a mentor … must also hold the tutor persona (**or an explicit override**) for manageCalendar/manageClassContent."_ Granting that override now yields `canWriteClass → true`, the service skips its `PermissionError` branch, and Postgres throws a raw `new row violates row-level security policy` — an opaque 500 through the error boundary instead of a clean 403. A documented remedy is silently non-functional.

This is the same comment block I flagged as stale in round 1 (B-08), corrected then, and wrong again now in a new way — which is the argument for deriving the app guard from the RPC rather than restating it in prose.

**N-09** — no DB `CHECK` on `mentee_notes.body`; the 2000-char bound lives only in Zod, and the writer is service-role.
**N-10** — `hasScopedPersona` (`personas.ts:67-71`) tests `scope_type !== 'global'`, while the DB's `mentors_student` pins `scope_type = 'student'`. Not currently exploitable (no writer produces `'class'` scope), but the app check is the operative gate for notes, so the looser one is the one that counts.
**N-11** — `note-actions.ts:13,17` — `student_id` is neither UUID-validated nor URI-encoded before interpolation into a redirect path. Not an open redirect (same-origin prefix), but garbage reaches `canMentor`.
**N-12** — denied note attempts are indistinguishable from validation failures and unaudited, so probing which children a mentor can write to leaves no trace.

---

## 4. Still open, unchanged

| ID                                                                    | Status      | Sev     | Note                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R-01** — snapshot omits table `REVOKE`s                             | **OPEN**    | HIGH¹   | I re-counted: 27 `REVOKE`, **0** `ON TABLE`, vs 6 in the chain. The new `restore-drill.sh` is a genuinely good addition but doesn't address this — it verifies migration head and receipt reconciliation, and `pg_restore` runs with `--no-privileges`, discarding the privilege model rather than checking it.    |
| **A-04** — credential change, no re-auth, **zero session revocation** | OPEN        | HIGH    | Re-grepped: `signOut` appears only in `api/logout/route.ts`. Nothing revokes on credential change or on revoke.                                                                                                                                                                                                    |
| **B-02** — Supabase dashboard cluster                                 | OPEN        | HIGH    | Still undocumented, unasserted, untested. Seven unknowns, each the last line of defence for a finding that is otherwise open.                                                                                                                                                                                      |
| **A-09** — `isClassAdmin` override-blind                              | OPEN        | MEDIUM  | The recent `class.ts` edit was A-07, not this. A `deny manageClasses` remains cosmetic for the class domain.                                                                                                                                                                                                       |
| **A-10** — `documentRoleFor` mentor uplift                            | OPEN        | MEDIUM  |                                                                                                                                                                                                                                                                                                                    |
| **A-15** — revoked accounts stay messageable                          | OPEN        | MEDIUM  | Still 2 of 6 branches filtered.                                                                                                                                                                                                                                                                                    |
| **B-01** — client-only reset validation                               | OPEN        | MEDIUM  |                                                                                                                                                                                                                                                                                                                    |
| **B-10** — OAuth binding asymmetry                                    | OPEN        | MEDIUM  | Denial-of-account on a pending admin row.                                                                                                                                                                                                                                                                          |
| **A-03 res.** — `drive_link` DB-unvalidated                           | OPEN        | MEDIUM  | Sharper now: `0067` revoked direct INSERT, making the RPC the **only** submission-creation path — and it stores `p_drive_link` verbatim (`0067:78`). Six render sites emit `href={drive_link}` behind only a `!== '#'` check. The resources path validates at both write _and_ redirect; submissions gets neither. |
| **A-03 res.** — post-deadline withdraw                                | OPEN        | MEDIUM  | `submissions_update` has no deadline term.                                                                                                                                                                                                                                                                         |
| **R-05** — feedback readable class-wide                               | OPEN        | MEDIUM  |                                                                                                                                                                                                                                                                                                                    |
| **R-08** — RLS alarm list                                             | **PARTIAL** | MEDIUM  | `guardians`/`consents` added; `mentee_notes` missed → N-02.                                                                                                                                                                                                                                                        |
| **B-06** — RLS harness                                                | **PARTIAL** | LOW-MED | Write assertions and a coverage gate added (real progress); the blanket grant is still _after_ the migration loop, so column-grant hardening remains untested.                                                                                                                                                     |
| **A-13** — `entity_tags` / unvalidated `?tag=`                        | PARTIAL     | LOW     | RLS state is correct fail-closed by design; the `?tag=` 500 remains.                                                                                                                                                                                                                                               |
| **B-09, B-11, B-13, CSP `form-action`, CI token**                     | OPEN        | LOW     | `B-11` still `role: 'teacher'` — invalid enum since `0019`.                                                                                                                                                                                                                                                        |

¹ HIGH for snapshot-provisioned environments (restore drill, staging, DR); **N/A for production**, which is built from the migration chain.

---

## 5. Findings by each audit

**Both audits found:** N-01 (consent values), N-02 (`mentee_notes` alarm gap), N-03/N-04/N-05 (notes lifecycle), the A-03 `drive_link` residual, and the confirmation that A-07 is closed.

**Audit A found, I did not — including four verdicts I got wrong and have corrected above:**

1. **R-02.** I saw `cookieOptions` passed with the shared constant and marked it fixed. I did not open `@supabase/ssr` to see how the options merge — and `cookies.js:205` hard-overrides `maxAge` after the spread, discarding it. **This is the third consecutive round the `@supabase/ssr` boundary has caught me**: round 1 I never read `DEFAULT_COOKIE_OPTIONS`; round 2 I never asked which client writes the cookie first; round 3 I never checked whether the options I passed are honoured. Each time I verified our code and stopped at the library edge.
2. **R-03.** I confirmed the actor was threaded and the clamp applied, and called it fixed — without checking whether the email fallback that _was_ the finding had been removed. It hadn't; only the admin tier is masked.
3. **R-07 / R-09-R-10.** I verified the helper and the guardians service and generalised to "fixed" without checking the specific call sites the findings named (`messages-rows.ts:46`, `getManagerSession`).
4. Also theirs: the full mentee-notes lifecycle (N-03/N-04/N-05) — I checked access control, confirmed a student cannot read notes about themselves, and stopped; N-13 (the `canWriteClass` divergence `0079` introduced); N-10; the Singapore/India contradiction inside `consents.ts`; that R-08 is missing **18** tables, not one; that `rls-coverage-parity.test.ts` fossilises a renamed ghost table (`class_teachers`) in its exempt list; and that `profiles_self_update` has **no `WITH CHECK`**, which makes R-01 privilege _escalation_ rather than just exposure.

**I found, Audit A did not:** N-08 (enumerating every function ACL in the snapshot to establish `teaches_class_write` is the only one missing a `REVOKE`), the independent re-count proving R-01 untouched plus the observation that `restore-drill.sh` runs `pg_restore --no-privileges`, and the build-state verification (1161 tests / 153 files, typecheck clean).

**Conflicts resolved:** my round-2 finding about a mentor clearing whole-class attendance is **moot** — `clearAttendanceAction` now requires `manageClassContent`. But Audit A is right that the underlying RLS grant is broader than the capability: `attendance_write`/`class_sessions_write` are `FOR ALL`, so mentors retain DELETE at the database layer regardless of the app gate.

---

## 6. Assessment

**The remediation is disciplined and the trend is strongly positive.** A-07 — the finding I'd called blocking twice — is closed correctly, with the DB now enforcing what the code declares. Seven other findings verified fixed. The team is also fixing _classes_ of problem, not just instances: `rls-coverage-parity.test.ts` and the new write assertions in `test-rls.sh` are exactly the mechanical gates this codebase needs.

Three patterns are worth naming, because each recurred this round:

1. **Hand-maintained lists and prose invariants drift.** `mentee_notes` was missed from the RLS alarm list in the same commit whose comment says such tables "were missing before" (N-02) — and 17 others are missing too. `teaches_class_write` was created without a `REVOKE` in the same batch that fixed three such omissions (N-08). `canWriteClass`'s RLS NOTE now asserts an agreement `0079` had just broken (N-13) — the same comment block corrected in round 1. All three are low-impact today; all three are repeat occurrences of the same failure. **Derive these from the schema instead of restating them.**

2. **Fixes are landing at the call site that was named, not the class of defect.** R-03 masked the admin tier but left the email fallback; R-07 repaired the helper but left the one raw caller; R-09 fixed guardians but left the identical pattern in `getManagerSession`. Each is a correct fix to a correctly-reported symptom, and each leaves the finding partly open.

3. **New features ship with correct access control and incomplete lifecycle.** Mentee notes have clean authorization — it was attacked from several angles and held; a student genuinely cannot read notes about themselves at either layer. But the notes can never be corrected or erased, are inherited by every future mentor, and reads aren't logged. Consents have a correct, unforgeable write path that records values nobody captured.

**A note on this audit's own reliability.** Four of my verdicts in the first draft of §2 were wrong, all in the same direction — I marked things fixed that were partly fixed. In each case I verified that the _named_ remedy was present and did not check whether the _finding_ was closed. The `@supabase/ssr` cookie boundary has now caught me three rounds running. Treat single-source "FIXED" verdicts in any of these reports as provisional until something mechanical asserts them.

**Not production-ready**, on a shrinking list: R-01, A-04, B-02, and N-01. N-01 is the one I'd escalate hardest — it isn't a vulnerability an attacker exploits, it's the academy's own evidence testifying against its published lawful basis for processing children's data, on every row.

### Order

1. **R-01** — generate the privilege epilogue into the snapshot; add the CI count assertion. Promoted to first because `profiles_self_update` has **no `WITH CHECK`** (`snapshot:3824`), so in a snapshot-provisioned DB this is `PATCH /rest/v1/profiles` with `{"role":"admin"}` — direct escalation, not just exposure.
2. **N-01** — capture guardian consent, or stop asserting the schema captures it. Correct the Singapore comment.
3. **A-04** — global sign-out on credential change and on revoke (~10 lines; also closes A-15's revoked-session tail).
4. **B-02** — one dashboard walkthrough collapses seven unknowns and is the precondition for correctly rating A-06, B-01, and B-09.
5. **The four partials from §2** — `R-02` (cap `maxAge` in the app's own `setAll`, since the library discards it), `R-03` (drop the email fallback), `R-07` (one import in `messages-rows.ts`), `R-09` (give `getManagerSession` an actor). All small; each closes a finding currently recorded as fixed elsewhere.
6. **N-02 / N-08 / N-13** — derive the alarm list; one `REVOKE` plus the CI assertion; split `canWriteClass` to mirror `teaches_class_write` and delete the false comment.
7. **N-04/N-05** — an admin-only audited soft-delete, and audit the note read.
8. **A-09 / A-10** — two one-line permission-flag corrections with unit tests.
9. **B-06(a)** — move one `psql` block above the migration loop.

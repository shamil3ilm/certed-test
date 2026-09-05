# Workflow invariants

The workflow rules that must remain true across code, RLS, and admin operations — the ones easy to break during refactors because they span multiple files, tables, or personas.

## 1. Identity and access

1. `profiles.role` is the fixed account identity.
2. `persona_assignments` is the authorization source for persona-based access.
3. Effective capability access is resolved from:
   - active personas
   - active global capability overrides
   - hard capability rules
4. Hard capabilities must not be granted or removed by normal overrides.
5. Capability reads must fail closed and loud if persona or override reads fail.

## 2. User lifecycle

1. Adding a user creates the `profiles` row and synchronizes the matching global persona.
2. Role reassignment is not part of the normal users workflow.
3. Revoking a user disables the profile and inactivates all of their personas.
4. Revoking a mentor also disables their active mentorship links.
5. Restoring a user restores their global role persona only.
6. Restoring a revoked mentor does not automatically restore prior mentorship links in the current implementation.
7. The last active admin must not be revocable.
8. A user must not be allowed to revoke themselves.

## 3. Mentor and mentee rules

1. A mentor may be:
   - an independent `mentor` account
   - a `tutor` who also mentors students
2. Mentee access is relationship-scoped, not granted to all tutors.
3. A plain tutor does not get mentee access unless they also hold mentor access for that student.
4. Student-scoped mentor authority is represented by scoped `persona_assignments`.
5. `mentorships` is the operational relationship record, but authorization checks must agree with persona state.
6. Removing a mentorship must remove the access-granting mentor persona before or with the relationship teardown.

## 4. Classroom rules

1. `viewClasses` is the coarse class-entry capability.
2. Actual entry to a class workspace also requires class membership through `canAccessClass(...)`.
3. Teaching management for a class must be based on the actor teaching that class, not on holding a global tutor persona alone.
4. Whole-class lifecycle actions such as create, rename, archive, and restore require the `manageClasses` capability (admin and sub_admin by default; override-grantable).
5. Changing class teaching staff requires `manageClasses`.
6. Attendance, class content, and grading changes must remain class-scoped.

## 4a. Hours reporting

Hours are always DERIVED from recorded sessions; no hours figure is ever typed in.

1. A session contributes hours only through its recorded window (`class_sessions.actual_start` -> `actual_end`). A session with no recorded start is excluded from every hours report; one with a start but no end counts as a session worth zero minutes.
2. The month is bounded by the INSTITUTE timezone's month edges, not the viewer's.
3. Hours TAUGHT are attributed to `class_sessions.tutor_id`, grouped by class first. A tutor's hours in one class must never be summed into a scope that only entitles the viewer to another class - grouping by (class, tutor) is what keeps a mentor's scoped view honest.
4. Hours RECEIVED by a student are that student's attended share of the same windows: a student marked `present` or `late` for a SESSION is credited with that session's recorded window. `absent` is credited nothing.
5. Attendance is per session, not per day (0094). A student who attended the morning of a two-session day is credited the morning only. Any hours figure must join on `attendance.session_id`, never on (class, date), which cannot tell the two sessions apart.
6. Student hours are NOT a partition of tutor hours and must never be reconciled against them. One hour taught to six students is one tutor-hour and six student-hours; the two answer different questions.
7. The academy-wide report is `manageClasses`-gated (admin and sub_admin). Narrower scopes have their own views: a mentor sees only classes their mentees are in, a tutor only their own totals.

## 5. Submissions and grading

1. A student submits only their own work.
2. Resubmission replaces the prior active submission and keeps history.
3. Graded work must not be silently overwritten by a new student resubmission.
4. A tutor grades against the submission's actual assignment and class, never a client-supplied class id.
5. If a submission becomes inactive before grading is saved, grading must fail rather than write to stale history.

## 6. Comments and messaging

1. Comments are contextual and attach only to the entity types defined in [schema-reference.md](schema-reference.md#comments) (submissions, resources, meet links, announcements) — never arbitrary records.
2. Messaging is a separate domain from comments.
3. Recipient eligibility for messaging must remain centralized in one policy surface.
4. New personas must not gain messaging reach implicitly.

## 7. Finance

1. Finance read access and finance write access are different concerns.
2. `viewFinance` is a read capability.
3. Issuing and voiding finance documents are structural admin-only operations.
4. Finance corrections are void-and-reissue, not in-place mutation.
5. An hourly rate is admin-tier data, not profile data. Nobody reads their own rate - a person sees the receipt or pay slip it produced, which is the record that is actually theirs.
6. A document may be GENERATED from hours, but it is never ISSUED automatically. Generation fills a draft; a person issues it. The number comes from a shared counter and the document cannot be edited afterwards, so the irreversible step stays deliberate.
7. Generation refuses rather than guesses: no rate set, or no hours in the month, produces a stated reason and no lines. It never bills zero.
8. A document records the month it bills for (`billing_period`), which is not its issue date. A live document already covering that person and month raises a warning, not a refusal - one month may legitimately span several documents.
9. A rate is denominated in its own currency. Hours are priced in the currency stored beside the rate, never in a currency chosen elsewhere on the form.

## 8. Permission UI and admin understanding

1. The current per-user permissions screen reflects global capability baseline plus global overrides.
2. It does not fully represent scoped access such as per-student mentor authority.
3. Admin-facing access tooling must clearly distinguish:
   - fixed identity
   - global capability state
   - scoped access state

## 9. Change rule

Any change that affects one of the invariants above must update:

1. the implementing code
2. the relevant docs
3. the tests or verification procedure

## 10. Retry and replay expectations

1. Workflows that use upsert or replace semantics must be safe to retry.
2. Partial failure ordering must fail toward the safer access outcome.
3. A user retry must not duplicate access grants, duplicate financial records, or produce conflicting status history unless the workflow is explicitly create-only and documented as such.

## 11. Consistency expectations

1. Identity labels, dashboard summaries, admin counts, and permission views must reflect the live persona model.
2. Global persona state and scoped relationship state must not be presented as the same thing.
3. User-facing workflow labels should stay consistent across navigation, page headers, widgets, and admin tooling.

## 12. Observability expectations

1. Critical workflow failures must be diagnosable from logs, audit records, or explicit verification output.
2. Access, lifecycle, and finance mutations must not disappear silently.
3. Best-effort side-effect failure must not hide whether the primary workflow succeeded.

## 13. State expectations

1. Revoked, disabled, archived, voided, inactive, and pending states must have clear operational meaning.
2. Restore behavior must be explicit for every workflow that supports restoration.
3. Derived UI such as counts, lists, and badges must treat those states consistently.

## 14. CRUD expectations

1. Every major domain must have an intentional create, read, update or correct, and retire-state story.
2. Hard delete should be reserved for technical cleanup or explicitly approved destructive operations.
3. Business lifecycle operations such as archive, void, deactivate, revoke, and restore should be treated as first-class flows, not hidden behind generic delete or update semantics.

## 15. API and protocol expectations

1. The application's default API style is REST.
2. Command-oriented exceptions may exist, but they should be explicit and consistent.
3. New protocols or integration styles should not appear without a clear documented reason and boundary.

## 16. Concurrency and caching expectations

1. Concurrent writes must not create duplicate access grants, duplicate lifecycle transitions, or ambiguous winning state silently.
2. Cache use must not preserve revoked access, stale persona state, or outdated status views beyond the intended freshness boundary.
3. Retry, cache, and invalidation behavior must agree with the workflow's lifecycle semantics.

## 17. Privacy and integration expectations

1. Exposed data should remain proportional to the actor's authorized purpose.
2. Logs, exports, and integrations must avoid leaking unnecessary sensitive data.
3. External integration failure must not corrupt the application's core access or record state.

## Related

- [persona-model.md](./persona-model.md)
- [messaging-design.md](./messaging-design.md)
- [schema-reference.md](./schema-reference.md)
- [architecture-rules.md](./architecture-rules.md)

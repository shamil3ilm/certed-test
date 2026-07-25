# Workflow Invariants

- Status: Current-state reference
- Purpose: Record the workflow rules that must remain true across code, RLS, and admin operations.

This document is for rules that are easy to break during refactors because they
span multiple files, tables, or personas.

## 1. Identity and Access

1. `profiles.role` is the fixed account identity.
2. `persona_assignments` is the authorization source for persona-based access.
3. Effective capability access is resolved from:
   - active personas
   - active global capability overrides
   - hard capability rules
4. Hard capabilities must not be granted or removed by normal overrides.
5. Capability reads must fail closed and loud if persona or override reads fail.

## 2. User Lifecycle

1. Adding a user creates the `profiles` row and synchronizes the matching global persona.
2. Role reassignment is not part of the normal users workflow.
3. Revoking a user disables the profile and inactivates all of their personas.
4. Revoking a mentor also disables their active mentorship links.
5. Restoring a user restores their global role persona only.
6. Restoring a revoked mentor does not automatically restore prior mentorship links in the current implementation.
7. The last active admin must not be revocable.
8. A user must not be allowed to revoke themselves.

## 3. Mentor and Mentee Rules

1. A mentor may be:
   - an independent `mentor` account
   - a `tutor` who also mentors students
2. Mentee access is relationship-scoped, not granted to all tutors.
3. A plain tutor does not get mentee access unless they also hold mentor access for that student.
4. Student-scoped mentor authority is represented by scoped `persona_assignments`.
5. `mentorships` is the operational relationship record, but authorization checks must agree with persona state.
6. Removing a mentorship must remove the access-granting mentor persona before or with the relationship teardown.

## 4. Classroom Rules

1. `viewClasses` is the coarse class-entry capability.
2. Actual entry to a class workspace also requires class membership through `canAccessClass(...)`.
3. Teaching management for a class must be based on the actor teaching that class, not on holding a global tutor persona alone.
4. Whole-class lifecycle actions such as create, rename, archive, and restore are admin-only.
5. Changing class teaching staff is admin-only.
6. Attendance, class content, and grading changes must remain class-scoped.

## 5. Submissions and Grading

1. A student submits only their own work.
2. Resubmission replaces the prior active submission and keeps history.
3. Graded work must not be silently overwritten by a new student resubmission.
4. A tutor grades against the submission's actual assignment and class, never a client-supplied class id.
5. If a submission becomes inactive before grading is saved, grading must fail rather than write to stale history.

## 6. Comments and Messaging

1. Comments are contextual and attached only to:
   - submissions
   - resources
   - meet links
2. Messaging is a separate domain from comments.
3. Recipient eligibility for messaging must remain centralized in one policy surface.
4. New personas must not gain messaging reach implicitly.

## 7. Finance

1. Finance read access and finance write access are different concerns.
2. `viewFinance` is a read capability.
3. Issuing and voiding finance documents are structural admin-only operations.
4. Finance corrections are void-and-reissue, not in-place mutation.

## 8. Permission UI and Admin Understanding

1. The current per-user permissions screen reflects global capability baseline plus global overrides.
2. It does not fully represent scoped access such as per-student mentor authority.
3. Admin-facing access tooling must clearly distinguish:
   - fixed identity
   - global capability state
   - scoped access state

## 9. Change Rule

Any change that affects one of the invariants above must update:

1. the implementing code
2. the relevant docs
3. the tests or verification procedure

## 10. Retry and Replay Expectations

1. Workflows that use upsert or replace semantics must be safe to retry.
2. Partial failure ordering must fail toward the safer access outcome.
3. A user retry must not duplicate access grants, duplicate financial records, or produce conflicting status history unless the workflow is explicitly create-only and documented as such.

## 11. Consistency Expectations

1. Identity labels, dashboard summaries, admin counts, and permission views must reflect the live persona model.
2. Global persona state and scoped relationship state must not be presented as the same thing.
3. User-facing workflow labels should stay consistent across navigation, page headers, widgets, and admin tooling.

## 12. Observability Expectations

1. Critical workflow failures must be diagnosable from logs, audit records, or explicit verification output.
2. Access, lifecycle, and finance mutations must not disappear silently.
3. Best-effort side-effect failure must not hide whether the primary workflow succeeded.

## 13. State Expectations

1. Revoked, disabled, archived, voided, inactive, and pending states must have clear operational meaning.
2. Restore behavior must be explicit for every workflow that supports restoration.
3. Derived UI such as counts, lists, and badges must treat those states consistently.

## 14. CRUD Expectations

1. Every major domain must have an intentional create, read, update or correct, and retire-state story.
2. Hard delete should be reserved for technical cleanup or explicitly approved destructive operations.
3. Business lifecycle operations such as archive, void, deactivate, revoke, and restore should be treated as first-class flows, not hidden behind generic delete or update semantics.

## 15. API and Protocol Expectations

1. The application's default API style is REST.
2. Command-oriented exceptions may exist, but they should be explicit and consistent.
3. New protocols or integration styles should not appear without a clear documented reason and boundary.

## 16. Concurrency and Caching Expectations

1. Concurrent writes must not create duplicate access grants, duplicate lifecycle transitions, or ambiguous winning state silently.
2. Cache use must not preserve revoked access, stale persona state, or outdated status views beyond the intended freshness boundary.
3. Retry, cache, and invalidation behavior must agree with the workflow's lifecycle semantics.

## 17. Privacy and Integration Expectations

1. Exposed data should remain proportional to the actor's authorized purpose.
2. Logs, exports, and integrations must avoid leaking unnecessary sensitive data.
3. External integration failure must not corrupt the application's core access or record state.

## Related docs

- [persona-model.md](./persona-model.md)
- [messaging-design.md](./messaging-design.md)
- [schema-reference.md](./schema-reference.md)
- [architecture-rules.md](./architecture-rules.md)

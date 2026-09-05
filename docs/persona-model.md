# Persona model

The live identity, persona, and capability model the application uses.

## 1. Two-layer model

The application uses two related but different concepts:

### Fixed identity

Stored on:

- `profiles.role`

Purpose:

- account type
- stable user identity
- some UX decisions

Current fixed identity values:

- `admin`
- `sub_admin`
- `tutor`
- `mentor`
- `student`

### Authorization personas

Stored on:

- `persona_assignments`

Purpose:

- capability resolution
- scoped access
- future persona expansion

Current live personas in active use:

- `admin`
- `sub_admin`
- `tutor`
- `mentor`
- `student`

Reserved for future expansion:

- `guardian`
- `finance_operator`
- `assistant`
- `executive`

## 2. Current persona behavior

### `admin`

- full application authority
- unified database admin authority through helper functions and RLS

### `sub_admin`

- an operational admin: manages users, classes, and mentorships across the academy
- **users** - add, edit, and revoke users (`manageUsers`)
- **classes** - create, rename, and archive classes, assign teaching staff, manage the timetable, post class content, mark attendance, and work the grading queue, academy-wide (`manageClasses`, `manageCalendar`, `manageClassContent`, `manageAttendance`, `viewGrading`, `viewClasses`)
- **mentorships** - assign and remove a student's mentor and view mentees (`manageMentorships`, `viewMentees`)
- deliberately WITHOUT the admin-tier structural power (`manageAdminTier`), the finance ledger (`viewFinance`), and the audit history (`viewHistory`) - those stay admin-only, grantable per user via an audited capability override

How the class authority is enforced: migration `0092` widens the two class-scope RLS
functions - `teaches_class_write` (content writes) and `teaches_class` (reads, attendance,
calendar/timetable) - to admit an active `sub_admin` persona, and the app guards
(`canAccessClass`, `canWriteClass`, `canWriteCalendar`, `documentRoleFor`) admit it in step
so a permitted write is never refused by the database. It deliberately does **not** widen
`is_active_admin()`: that gates finance, the audit log, capability overrides and persona
assignment, which stay admin-only. The guards key on the **persona** rather than the
capability precisely because RLS does - gating on a capability an override could grant to
someone else would make the app looser than the database.

### `tutor`

- teaching authority
- class-scoped academic operations

### `mentor`

- independent mentor identity is supported
- a mentor may or may not also be a tutor
- mentor access is relationship-based for mentee visibility
- mentor access is not implied for every tutor
- dedicated mentor accounts use the same fixed identity and persona labels throughout the app
- **operational scope** - a mentor holds `manageCalendar`, `manageAttendance`, and
  `viewGrading` in addition to the read capabilities, so a mentor can schedule, mark
  attendance, and see the grading queue for a mentee's class

#### Content authoring is tutor-only

A mentor is a **read-only overseer of content**. This is load-bearing and easy to
reintroduce as a bug, so it is stated here explicitly:

- a mentor holds **no `manageClassContent`** capability
- `DOCUMENT_PERMISSION_MATRIX.mentor` is `view`/`download` only — `upload`, `edit`,
  `delete`, and `share` are `'no'` (`src/lib/permission/documents.ts`), and a `'no'`
  entry short-circuits **before** the class-scope check, so a broader class relationship
  cannot rescue it
- tagging follows the same rule: a class tag is gated on `canWriteClass` (tutor-of-class
  or admin), and a resource tag flows through the document matrix
  (`src/lib/services/tags.ts`)
- the database agrees: content writes are gated on `teaches_class_write`, which is
  tutor-only, as distinct from `teaches_class` (tutor **or** mentor-of-an-enrollee) used
  for calendar and attendance

A person who both teaches and mentors gets write access through their **tutor** persona,
never through the mentor one. `documentRoleFor` therefore matches `isTutor` before
`isMentor`, so mentoring a student never widens a tutor's authoring rights.

### `student`

- self-service academic and finance visibility

## 3. Hybrid cases

The model supports hybrid authorization cases.

Example:

- a tutor may also hold mentor personas for specific students

This means:

- fixed identity can still be `tutor`
- authorization can include both teaching and mentorship scope
- UI labels should not silently collapse this to a single identity where the distinction matters

## 4. Capability model

Effective access is resolved from:

1. active personas
2. capability overrides
3. hard capability rules that cannot be override-granted normally

Important:

- page access
- API access
- navigation

should stay aligned with the resolved capability set.

Current caveat:

- the per-user permission editor is a global-capability view, not a full scoped-access view

## 5. Database alignment

RLS and helper functions must agree with the application model.

Key points:

- `user_is_admin(...)` is part of the admin authority model
- `is_active_admin()` must stay aligned with that model
- self-read and self-update helpers must fail closed for disabled users

## 6. Lifecycle consequences

Important current behavior:

1. Creating or restoring a profile synchronizes its global persona.
2. Revoking a profile inactivates all of its personas.
3. Revoking a mentor also disables active mentorship links.
4. Restoring a revoked mentor currently restores the global persona only; prior mentorship links are not automatically reactivated.

## 7. Future persona rule

Adding a new persona is not only a database change.

A complete persona addition must update:

1. persona assignment support
2. capability mapping
3. auth and access docs
4. route and nav behavior if applicable
5. tests
6. any required RLS helpers or policy behavior

## 8. Related docs

- [schema-reference.md](./schema-reference.md)
- [rls-policy-inventory.md](./rls-policy-inventory.md)
- [architecture-rules.md](./architecture-rules.md)
- [workflow-invariants.md](./workflow-invariants.md)

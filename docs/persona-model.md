# Persona Model

- Status: Current-state reference
- Purpose: Document the live identity, persona, and capability model used by the application.

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

- operational user-management authority
- narrower than admin
- current creation and management scope is intentionally narrower than admin
- current model allows tutor and student account management only by default
- mentorship assignment and other sensitive delegation rules must stay explicit and documented

### `tutor`

- teaching authority
- class-scoped academic operations

### `mentor`

- independent mentor identity is supported
- a mentor may or may not also be a tutor
- mentor access is relationship-based for mentee visibility
- mentor access is not implied for every tutor
- dedicated mentor accounts use the same fixed identity and persona labels throughout the app

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

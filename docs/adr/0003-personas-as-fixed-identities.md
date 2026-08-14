# 0003 — Personas are fixed identities

- **Date:** 2026-08-03
- **Status:** Accepted

## Context

Learning platforms often let an account be "promoted" or "demoted" between roles. In this academy a student, tutor, and mentor are fundamentally different people with different data expectations (class memberships, mentorships, scoped personas, finance records). A role reassignment that silently left those trailing would corrupt reports and access.

## Decision

A persona is set at account creation and is not editable through the everyday Users hub — `editUserSchema` deliberately excludes `role`. There is no demotion/promotion path. Editing a user changes profile details only. If a genuine reassignment is ever required it must be a separate, audited, admin-only migration that also reconciles class memberships, mentorships, scoped personas, and finance expectations.

## Consequences

- Authorization and reporting can trust that a persona is stable for an account's lifetime.
- Onboarding the wrong role is corrected by disabling and re-creating, not by mutating.

## Follow-up work

- None planned. Revisit only if a real reassignment workflow becomes a requirement.

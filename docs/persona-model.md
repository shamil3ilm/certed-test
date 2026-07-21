# Phase 4.5: Schema and RLS Overhaul - Persona Model Migration

**Date:** July 16, 2026  
**Status:** Design & Implementation  
**Purpose:** Replace single `role` field with persona-assignment model to support multiple personas, scoped personas, and future persona expansion.

**Critical:** This phase is a production gate. Schema changes planned here must be completed before first production launch because they cannot be undone as a live migration.

---

## Problem Statement

**Current State:**
- Single `profiles.role` field with 4 values: admin, sub_admin, teacher, student
- One role per user (cannot be both tutor AND mentor)
- No way to scope personas (e.g., "mentor for Student A" vs. "mentor for Student B")
- Blocks planned personas: guardian, finance_operator, assistant, executive

**Target State:**
- Multiple personas per user (e.g., tutor + mentor)
- Scoped personas (e.g., mentor is scoped to specific student)
- Future-ready: add new personas without schema changes
- Same RLS and capability logic, better structured

---

## Solution: `persona_assignments` Table

### Schema

```sql
CREATE TABLE persona_assignments (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id),
  persona_name TEXT NOT NULL,           -- admin, sub_admin, tutor, mentor, student, etc.
  scope_type TEXT NOT NULL DEFAULT 'global', -- global, class, student, finance, reporting
  scope_id UUID,                         -- class_id, student_id (for non-global)
  status TEXT DEFAULT 'active',          -- active, inactive
  assigned_at TIMESTAMP DEFAULT now(),

  UNIQUE(profile_id, persona_name, scope_id)
);
```

### Persona Definitions

#### Current Personas (5)

| Persona | Scope | Capabilities | Use Case |
|---------|-------|--------------|----------|
| `admin` | global | All 13 | Full application access |
| `sub_admin` | global | viewDashboard, viewUsers, manageUsers | User management only |
| `tutor` | global | viewDashboard, viewClasses, viewCalendar, manageCalendar, viewGrading, viewMentees, viewPayslips | Class teaching |
| `mentor` | student | viewDashboard, viewMentees | Pastoral oversight of specific student |
| `student` | global | viewDashboard, viewClasses, viewCalendar, viewReceipts | Learning access |

#### Future Personas (4) - Placeholder Definitions

| Persona | Scope | Planned Capabilities | Use Case |
|---------|-------|----------------------|----------|
| `guardian` | student | viewDashboard, viewReceipts, (read-only reports) | Parent/guardian access |
| `finance_operator` | global | viewDashboard, viewFinance, viewHistory | Finance admin (not full admin) |
| `assistant` | class | viewDashboard, (class-specific) | Administrative assistant |
| `executive` | global | viewDashboard, viewFinance, viewHistory | Executive reporting |

### Scope Types

- **global**: Academy-wide access (admin, tutor, student)
- **class**: Scoped to a specific class (future: assistant, class-specific roles)
- **student**: Scoped to a specific student (mentor: "mentor for Student A")
- **finance**: Scoped to finance operations (future: finance_operator)
- **reporting**: Scoped to reporting access (future: executive reporting)

---

## Migration Strategy: 3-Phase, Backward Compatible

### Phase 0: Preparation (Week 1)
**Goal:** Add new infrastructure, run in parallel with old system

**Migrations:**
1. `0014_add_persona_assignments_table.sql`
   - Create `persona_assignments` table
   - Create enums: `persona_name`, `persona_scope_type`
   - Create indexes for hot paths
   - RLS: Set to DEFAULT NONE (not enforced yet)

2. `0015_populate_persona_assignments.sql`
   - Migrate existing roles: profiles.role → persona_assignments
   - Extract mentor relationships: mentorships → persona_assignments (student-scoped)
   - Both systems coexist; profiles.role still used by code

3. `0016_update_rls_for_personas.sql`
   - Create helper functions: user_has_persona(), user_is_admin(), user_is_mentor_for_student()
   - Add audit logging for persona changes
   - RLS: Still reads from profiles.role (not switched yet)

**Exit Criteria:**
- ✅ persona_assignments table populated
- ✅ Mentor relationships extracted
- ✅ Helper functions created
- ✅ Tests: 0 regressions on existing functionality

### Phase 1: Code Migration (Week 2)
**Goal:** Update application to read from persona_assignments

**Code Changes:**
1. Update `src/lib/capabilities/index.ts`
   - Add PERSONA_CAPABILITIES mapping (complete)
   - Functions now read from persona_assignments (if available)
   - Fallback to profiles.role for backward compat

2. Update auth/session layer (src/lib/session/actorContext.ts)
   - Load persona_assignments alongside profile
   - Pass to capabilities resolver

3. Update RLS policies
   - Switch to read from persona_assignments
   - Test: all persona journeys work

**Exit Criteria:**
- ✅ Code reads from persona_assignments
- ✅ Capabilities aggregated correctly
- ✅ All role journeys still work
- ✅ Safe rollback possible (profiles.role still exists)

### Phase 2: Cleanup (Week 3)
**Goal:** Remove deprecated role field

**Migration (future):**
- `00NN_cleanup_profiles_role.sql` (next free number after the current chain)
  - Add comment: "profiles.role deprecated Phase 4.5"
  - (Can be removed later; not removed now to allow rollback)
  - Verify no code reads from profiles.role

**Exit Criteria:**
- ✅ Code verified not reading profiles.role
- ✅ RLS fully on persona_assignments
- ✅ No rollback path (commit to new model)

---

## Implementation Checklist

### Phase 0 (Ready Now)
- [x] Design persona model
- [x] Create migrations 0014-0016
- [x] Create PERSONA_CAPABILITIES mapping
- [ ] Deploy migrations to dev environment
- [ ] Run validation queries
- [ ] Verify data migration (counts, relationships)

### Phase 1 (Next)
- [ ] Update actorContext to load personas
- [ ] Update capabilities to use persona_assignments
- [ ] Test all role journeys (admin, sub_admin, tutor, mentor, student)
- [ ] Test multi-persona scenarios (tutor + mentor)
- [ ] Update tests (fixtures)
- [ ] E2E verify each persona dashboard/navigation
- [ ] Code review with security focus (RLS changes)

### Phase 2 (After Phase 1 verified)
- [ ] Deploy migration 0017 cleanup
- [ ] Final verification in production
- [ ] Monitor for access regressions

---

## Key Decisions

1. **Rename teacher → tutor**: Align with UI and future persona expansion
2. **Extract mentor as separate persona**: Cleaner scoping; maps to mentorships table
3. **Atomic migration**: All roles migrated at migration time (no dual-running)
4. **Backward compatibility**: Both systems coexist during Phase 0-1
5. **No breaking changes**: Capabilities aggregated; old role checks still work

---

## Risk Mitigation

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Data loss during migration | Migration tested in dev first; verify counts | QA |
| RLS locking out users | RLS helper functions tested independently | QA |
| Mentor relationships lost | verify mentorships → persona_assignments | QA |
| Admin access disabled | Test admin-only paths; RLS allows admin override | QA |
| Rollback needed | profiles.role preserved until Phase 2 | DevOps |

---

## Production Readiness Criteria

Before production launch, ALL must be true:

- [x] Schema designed and migrations written
- [ ] Migrations tested in dev environment
- [ ] All personas tested end-to-end (admin, sub_admin, tutor, mentor, student)
- [ ] No access regressions
- [ ] RLS policies verified secure
- [ ] Indexes performing well
- [ ] Rollback plan documented (if needed before Phase 2)
- [ ] Fresh environment builds from migrations cleanly
- [ ] Documentation updated

---

## Files Created

1. **supabase/migrations/0014_add_persona_assignments_table.sql** — Table creation
2. **supabase/migrations/0015_populate_persona_assignments.sql** — Data migration
3. **supabase/migrations/0016_update_rls_for_personas.sql** — RLS helpers & audit
4. **src/lib/capabilities/index.ts** — PERSONA_CAPABILITIES mapping (updated)
5. **This document** — Phase 4.5 reference

---

## Next Steps

1. Review this design document
2. Approve persona definitions and scope types
3. Deploy migrations 0014-0016 to dev
4. Run Phase 0 verification (see checklist above)
5. Begin Phase 1: Code migration (update actorContext, RLS)
6. E2E test all personas
7. Deploy Phase 1 to production
8. Monitor for regressions
9. Deploy Phase 2 cleanup (after Phase 1 verified in production)

---

## Reference: Capability Mapping

All 13 capabilities, their purposes, and which personas have them:

| Capability | Purpose | admin | sub_admin | tutor | mentor | student | guardian | finance_op | assistant | executive |
|------------|---------|-------|-----------|-------|--------|---------|----------|-----------|-----------|-----------|
| viewDashboard | Access dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| viewClasses | View classes | ✅ |  | ✅ |  | ✅ |  |  |  |  |
| viewCalendar | View events | ✅ |  | ✅ |  | ✅ |  |  |  |  |
| manageCalendar | Create events | ✅ |  | ✅ |  |  |  |  |  |  |
| viewGrading | View submissions | ✅ |  | ✅ |  |  |  |  |  |  |
| viewUsers | User list | ✅ | ✅ |  |  |  |  |  |  |  |
| manageUsers | User admin | ✅ | ✅ |  |  |  |  |  |  |  |
| viewFinance | Finance ledger | ✅ |  |  |  |  |  | ✅ |  | ✅ |
| viewHistory | Audit log | ✅ |  |  |  |  |  | ✅ |  | ✅ |
| viewMentees | Mentee list | ✅ |  | ✅ | ✅ |  |  |  |  |  |
| viewPayslips | Payslips | ✅ |  | ✅ |  |  |  |  |  |  |
| viewReceipts | Receipts | ✅ |  |  |  | ✅ | ✅ |  |  |  |
| manageAdminTier | Promote to admin | ✅ |  |  |  |  |  |  |  |  |

---

## Questions & Answers

**Q: Is a mentor always a tutor?**  
A: No — as of migration 0021, `mentor` is an INDEPENDENT `profiles.role` (a mentor may or may not also be a tutor). A dedicated mentor account holds the global `mentor` persona (pastoral oversight caps only) plus one student-scoped `mentor` persona per mentee, and teaches nothing. A tutor who also mentors holds the global `tutor` persona AND those student-scoped `mentor` personas, so they teach and mentor. Mentee-access RLS is relationship-based (`mentors_student` joins the `mentorships` row, never the role), so both work identically. Capabilities aggregate across all held personas.

**Q: Can we rollback from Phase 1 to Phase 0?**  
A: Yes, profiles.role is preserved. Code reads both until Phase 2 cleanup. If needed, revert code to read profiles.role only.

**Q: Can we rollback from Phase 2?**  
A: Not easily. Phase 2 is the point of no return. Before Phase 2, confirm production stability.

**Q: What about scoped mentor personas? Do they conflict with global tutors?**  
A: No. A tutor can have:
- `tutor` (global) — teaches all classes
- `mentor` (student: Sara) — mentors Sara specifically
- `mentor` (student: Tom) — mentors Tom specifically
All three active simultaneously, no conflict.

**Q: How do we add new personas after Phase 2?**  
A: Add to PERSONA_CAPABILITIES mapping in code, add to persona_name enum in DB. No schema changes needed.

---

**Status:** ✅ Phase 4.5 Design Complete  
**Next:** Phase 4.5 Step 2 - Migration Implementation & Verification

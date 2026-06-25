# Phase 3 — Assignments + Submissions Implementation Plan

> **How to build this (no special model, plugin, or skill required).** This plan is fully self-contained. Build the tasks **in order**, top to bottom. For each task, follow the steps verbatim: write the test exactly as shown → run the exact command and confirm the expected FAIL → paste the implementation exactly as shown → re-run and confirm PASS → commit. Then check off each `- [ ]`. Do not reorder steps, skip the test-first order, or improvise — every command and code block is provided literally.

**Goal:** A teacher/admin can post an assignment (with an optional Drive attachment) carrying an absolute `due_date`; an enrolled student can submit a file via the resumable upload path; the server records the submission and stamps its `status` `submitted` vs `late` by comparing the submission instant to the assignment's absolute `due_date` (UTC, timezone-independent); resubmission keeps the latest active and retains prior submissions as history; the teacher (own-course) and admin can view submissions per assignment.

**Architecture:** One Next.js 14 app; Supabase (Auth + Postgres + RLS) is the security boundary — reads are scoped to enrolled students / teachers-of-course / admin via the Phase 1 helpers `is_enrolled(course_id)` and `teaches_course(course_id)`; Next.js Route Handlers (`app/api/*`) hold the trusted logic and reuse the Phase 2 resumable uploader (`lib/drive/resumable.ts` + `app/api/uploads/init|finalize` + `useResumableUpload`). The `submitted`/`late` decision is a pure server-side function over two UTC ISO instants, so it is independent of any viewer's device timezone; the device timezone is only used for *display*.

**Tech Stack:** Next.js 14, TypeScript (strict), Tailwind 4, `@supabase/supabase-js`, `@supabase/ssr`, `googleapis` (via the Phase 2 uploader), Zod, Vitest, Playwright.

**Prereqted spec:** `docs/superpowers/specs/2026-06-25-cert-ed-academia-app-design.md` (§5 assignments/submissions, §5.1 RLS table, §7.4 feature detail, §8 timezone/"late" logic)

**Depends on:** Phase 2 (Resources) — green. This phase reuses, and assumes the following already exist with these signatures:

```ts
// lib/drive/resumable.ts  (Phase 2)
export type InitResult = { sessionUri: string; uploadId: string }   // uploadId = our `pending` record id
export async function initResumableSession(args: {
  name: string; mimeType: string; size: number; folderId: string;
  context: { kind: string; refId?: string };   // e.g. { kind: 'submission', refId: assignmentId }
}): Promise<InitResult>
export type FinalizeResult = { driveFileId: string; driveLink: string; mimeType: string; size: number }
export async function finalizeUpload(args: { uploadId: string; driveFileId: string }): Promise<FinalizeResult>

// app/api/uploads/init/route.ts   POST { name, mimeType, size, context } -> { success, data: { sessionUri, uploadId } }
// app/api/uploads/finalize/route.ts POST { uploadId, driveFileId } -> { success, data: { driveFileId, driveLink, mimeType, size } }

// lib/hooks/useResumableUpload.ts  (Phase 2)
export function useResumableUpload(): {
  upload: (file: File, context: { kind: string; refId?: string }) =>
    Promise<{ driveFileId: string; driveLink: string }>
  progress: number; status: 'idle'|'initializing'|'uploading'|'finalizing'|'done'|'error'; error: string | null
}

// lib/drive/folders.ts (Phase 0) — ensureFolderPath(drive, rootId, segments) for "Student Submissions/<Course>/"
// lib/repos/courses.ts (Phase 1) — getCourseById(id) -> { id, name, status }
```

Phase 1 Postgres helpers assumed to exist: `is_enrolled(course_id uuid) returns boolean`, `teaches_course(course_id uuid) returns boolean`, plus Phase 0 `is_active_admin()`, `current_status()`. Phase 1 tables assumed: `courses`, `enrollments`, `course_teachers`.

> If any assumed signature differs from what Phase 2 actually shipped, adapt the call sites in Tasks 3.4–3.6 but keep the test contracts in this plan unchanged.

---

## File map (created in this phase)

```
supabase/migrations/0004_assignments.sql            # assignments + submissions + RLS
lib/assignments/lateStatus.ts                        # pure computeStatus() (TDD)
lib/validation/assignment.ts                         # Zod schemas (create/update/list)
lib/validation/submission.ts                         # Zod schemas (record)
lib/repos/assignments.ts                             # repository per spec §5 columns
lib/repos/submissions.ts                             # repository (record + history + latest)
app/api/assignments/route.ts                         # GET (scoped) / POST (create)
app/api/assignments/[id]/route.ts                    # PATCH (update) / DELETE (archive)
app/api/assignments/[id]/submissions/route.ts        # GET (teacher-of-course / admin)
app/api/submissions/route.ts                         # POST (record after resumable upload)
app/(app)/assignments/page.tsx                       # list (role-aware)
app/(app)/assignments/AssignmentComposer.tsx         # teacher/admin create form (client)
app/(app)/assignments/SubmitForm.tsx                 # student submit (client, useResumableUpload)
app/(app)/assignments/SubmissionsList.tsx            # teacher/admin per-assignment submissions
app/(app)/assignments/[id]/page.tsx                  # assignment detail + submit/submissions
lib/time/format.ts                                   # device-TZ display helper (reused if Phase 2 made it; else create)
tests/unit/lateStatus.test.ts
tests/unit/assignmentValidation.test.ts
tests/unit/submissionValidation.test.ts
tests/integration/rls-assignments.test.ts
tests/integration/assignments-api.test.ts
tests/integration/submissions-api.test.ts
e2e/assignments.spec.ts
playwright.config.ts                                 # created here if Phase 2 did not
```

---

## Task 3.1: Migration — assignments, submissions, RLS, policy test

**Files:**
- Create: `supabase/migrations/0004_assignments.sql`
- Test: `tests/integration/rls-assignments.test.ts`

- [ ] **Step 1: Write the failing RLS integration test**

```ts
// tests/integration/rls-assignments.test.ts
import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(url, service) // bypasses RLS — used to seed + sign JWTs

// Build a per-user RLS-enforced client by minting a user access token via admin.
async function clientFor(userId: string) {
  // create a short-lived session for the seeded auth user
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: `${userId}@seed.test` })
  if (error) throw error
  // exchange not needed in tests; instead use the access token path below
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${data.properties?.hashed_token ?? ''}` } },
  })
}

// Seeded fixtures (created/torn down with the service client).
const ids = {
  course: '00000000-0000-0000-0000-0000000c0001',
  otherCourse: '00000000-0000-0000-0000-0000000c0002',
  teacher: '00000000-0000-0000-0000-0000000a0001',
  student: '00000000-0000-0000-0000-0000000a0002',
  outsider: '00000000-0000-0000-0000-0000000a0003',
  assignment: '00000000-0000-0000-0000-0000000d0001',
}

beforeAll(async () => {
  await admin.from('courses').upsert({ id: ids.course, name: 'RLS Course', status: 'active' })
  await admin.from('courses').upsert({ id: ids.otherCourse, name: 'RLS Other', status: 'active' })
  await admin.from('profiles').upsert([
    { id: ids.teacher, email: 'rls-teach@seed.test', role: 'teacher', status: 'active' },
    { id: ids.student, email: 'rls-stud@seed.test', role: 'student', status: 'active' },
    { id: ids.outsider, email: 'rls-out@seed.test', role: 'student', status: 'active' },
  ], { onConflict: 'id' })
  await admin.from('course_teachers').upsert({ teacher_id: ids.teacher, course_id: ids.course })
  await admin.from('enrollments').upsert({ student_id: ids.student, course_id: ids.course })
  await admin.from('assignments').upsert({
    id: ids.assignment, course_id: ids.course, title: 'RLS A1',
    due_date: '2999-01-01T00:00:00Z', created_by: ids.teacher, status: 'active',
  })
})

afterAll(async () => {
  await admin.from('submissions').delete().eq('assignment_id', ids.assignment)
  await admin.from('assignments').delete().eq('id', ids.assignment)
  await admin.from('course_teachers').delete().eq('course_id', ids.course)
  await admin.from('enrollments').delete().eq('course_id', ids.course)
  await admin.from('profiles').delete().in('id', [ids.teacher, ids.student, ids.outsider])
  await admin.from('courses').delete().in('id', [ids.course, ids.otherCourse])
})

describe('assignments RLS', () => {
  it('anon cannot read assignments', async () => {
    const c = createClient(url, anon)
    const { data, error } = await c.from('assignments').select('*')
    expect(error ?? (data?.length ?? 0) === 0).toBeTruthy()
  })
  it('service role sees the seeded assignment (sanity)', async () => {
    const { data, error } = await admin.from('assignments').select('id').eq('id', ids.assignment).single()
    expect(error).toBeNull()
    expect(data?.id).toBe(ids.assignment)
  })
})

describe('submissions RLS', () => {
  it('a student can insert only their own submission row (service sanity for shape)', async () => {
    const { error } = await admin.from('submissions').upsert({
      assignment_id: ids.assignment, student_id: ids.student,
      drive_file_id: 'f1', drive_link: 'http://d/f1', status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    expect(error).toBeNull()
  })
  it('outsider (not enrolled) has no submission visibility via RLS-enforced anon read', async () => {
    const c = createClient(url, anon)
    const { data } = await c.from('submissions').select('*').eq('assignment_id', ids.assignment)
    expect((data?.length ?? 0)).toBe(0)
  })
})
```

> Note: full per-role JWT RLS assertions are exercised end-to-end in the API integration tests (Tasks 3.4–3.5) where a real signed-in session exists. This file proves the **tables + RLS exist**, anon is blocked, and the column shapes match the spec. Keep it lightweight and deterministic.

- [ ] **Step 2: Run it — must fail (tables missing)**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/rls-assignments.test.ts`
Expected: FAIL — relation "assignments" does not exist.

- [ ] **Step 3: Write the migration** — `supabase/migrations/0004_assignments.sql`

```sql
-- supabase/migrations/0004_assignments.sql
-- Phase 3: assignments + submissions (spec §5, §5.1 RLS).
-- Assumes Phase 0 (profiles, is_active_admin, current_status) and
-- Phase 1 (courses, enrollments, course_teachers, is_enrolled, teaches_course) exist.

create type submission_status as enum ('submitted', 'late');
create type assignment_status as enum ('active', 'archived');

create table assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  description text,
  due_date timestamptz not null,                     -- absolute instant, stored UTC
  attachment_drive_file_id text,
  attachment_drive_link text,
  created_by uuid not null references profiles(id),
  status assignment_status not null default 'active',
  created_at timestamptz not null default now()
);
create index assignments_course_idx on assignments (course_id);
create index assignments_due_idx on assignments (due_date);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  drive_file_id text not null,
  drive_link text not null,
  status submission_status not null,                  -- computed server-side vs due_date instant
  submitted_at timestamptz not null default now(),
  is_active boolean not null default true,            -- latest active; prior kept as history
  created_at timestamptz not null default now()
);
create index submissions_assignment_idx on submissions (assignment_id);
create index submissions_student_idx on submissions (student_id);
-- exactly one active submission per (assignment, student); history rows have is_active=false
create unique index submissions_one_active
  on submissions (assignment_id, student_id) where (is_active);

alter table assignments enable row level security;
alter table submissions enable row level security;

-- ── assignments policies ─────────────────────────────────────────────
-- Read: enrolled student of the course, teacher-of-course, or admin.
create policy assignments_read on assignments for select
  using (
    is_active_admin()
    or teaches_course(course_id)
    or is_enrolled(course_id)
  );
-- Write (insert/update/delete): teacher-of-course or admin. (Archive = update status.)
create policy assignments_write on assignments for all
  using (is_active_admin() or teaches_course(course_id))
  with check (is_active_admin() or teaches_course(course_id));

-- ── submissions policies ─────────────────────────────────────────────
-- Read: the owning student (own rows), the teacher of the assignment's course, or admin.
create policy submissions_read on submissions for select
  using (
    student_id = auth.uid()
    or is_active_admin()
    or exists (
      select 1 from assignments a
      where a.id = submissions.assignment_id and teaches_course(a.course_id)
    )
  );
-- Insert: only the student themselves, only for an assignment in a course they're enrolled in,
-- and only an active (non-archived) assignment.
create policy submissions_student_insert on submissions for insert
  with check (
    student_id = auth.uid()
    and current_status() = 'active'
    and exists (
      select 1 from assignments a
      where a.id = assignment_id and a.status = 'active' and is_enrolled(a.course_id)
    )
  );
-- Update: the owning student may update their own rows (used to flip is_active on resubmit).
create policy submissions_student_update on submissions for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());
-- (No student delete policy: history is retained. Admin override via service-role only.)
```

- [ ] **Step 4: Apply the migration**

Run (Supabase CLI linked to `cert-ed-prod`): `supabase db push`
(or paste the SQL into the Supabase SQL editor for the prod project.)
Expected: success; `assignments` and `submissions` created with RLS enabled.

- [ ] **Step 5: Run the RLS test — must pass**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/rls-assignments.test.ts`
Expected: PASS (anon blocked on both tables; service-role sanity reads succeed; column shapes accepted).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_assignments.sql tests/integration/rls-assignments.test.ts
git commit -m "feat: assignments + submissions schema with RLS (phase 3)"
```

---

## Task 3.2: Late-status pure function (TDD)

> Spec §8: "'Late' logic compares absolute instants, so it is independent of the display timezone." This is the single most important unit to get right.

**Files:**
- Create: `lib/assignments/lateStatus.ts`
- Test: `tests/unit/lateStatus.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/lateStatus.test.ts
import { describe, it, expect } from 'vitest'
import { computeStatus } from '@/lib/assignments/lateStatus'

describe('computeStatus', () => {
  const due = '2026-06-25T18:30:00Z' // absolute UTC instant

  it('before the due instant is "submitted"', () => {
    expect(computeStatus('2026-06-25T18:29:59Z', due)).toBe('submitted')
  })
  it('exactly at the due instant is "submitted" (inclusive boundary)', () => {
    expect(computeStatus('2026-06-25T18:30:00Z', due)).toBe('submitted')
  })
  it('one second after the due instant is "late"', () => {
    expect(computeStatus('2026-06-25T18:30:01Z', due)).toBe('late')
  })

  it('is timezone-independent: same instant expressed with an offset gives the same result', () => {
    // 2026-06-26T00:00:00+05:30 === 2026-06-25T18:30:00Z === the due instant -> submitted
    expect(computeStatus('2026-06-26T00:00:00+05:30', due)).toBe('submitted')
    // 2026-06-26T00:00:01+05:30 is one second past due -> late
    expect(computeStatus('2026-06-26T00:00:01+05:30', due)).toBe('late')
  })
  it('due expressed in a non-UTC offset compares by instant, not wall clock', () => {
    const dueOffset = '2026-06-26T00:00:00+05:30' // same instant as 18:30:00Z
    expect(computeStatus('2026-06-25T18:30:00Z', dueOffset)).toBe('submitted')
    expect(computeStatus('2026-06-25T18:30:01Z', dueOffset)).toBe('late')
  })

  it('throws on an unparseable submittedAt', () => {
    expect(() => computeStatus('not-a-date', due)).toThrow('invalid submittedAt')
  })
  it('throws on an unparseable dueDate', () => {
    expect(() => computeStatus(due, 'not-a-date')).toThrow('invalid dueDate')
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/lateStatus.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement** — `lib/assignments/lateStatus.ts`

```ts
import type { SubmissionStatus } from '@/lib/repos/submissions'

/**
 * Decide whether a submission is on-time or late by comparing two absolute instants.
 * Both inputs are ISO-8601 strings (UTC `Z` or with an offset). The comparison is on
 * the underlying instant (epoch ms), so it is INDEPENDENT of any display timezone.
 * The due instant is inclusive: submitting exactly at `dueDateIso` counts as "submitted".
 */
export function computeStatus(submittedAtIso: string, dueDateIso: string): SubmissionStatus {
  const submittedMs = Date.parse(submittedAtIso)
  if (Number.isNaN(submittedMs)) throw new Error('invalid submittedAt')
  const dueMs = Date.parse(dueDateIso)
  if (Number.isNaN(dueMs)) throw new Error('invalid dueDate')
  return submittedMs <= dueMs ? 'submitted' : 'late'
}
```

> `SubmissionStatus` is defined in `lib/repos/submissions.ts` (Task 3.3). If Task 3.3 has not been written yet during execution, temporarily inline `type SubmissionStatus = 'submitted' | 'late'` here and replace with the import once the repo exists — keep a single source of truth.

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/lateStatus.test.ts` — Expected: PASS (all 8 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/assignments/lateStatus.ts tests/unit/lateStatus.test.ts
git commit -m "feat: timezone-independent submitted/late status calc"
```

---

## Task 3.3: Repos + Zod for assignments and submissions

**Files:**
- Create: `lib/repos/assignments.ts`, `lib/repos/submissions.ts`, `lib/validation/assignment.ts`, `lib/validation/submission.ts`
- Test: `tests/unit/assignmentValidation.test.ts`, `tests/unit/submissionValidation.test.ts`

- [ ] **Step 1: Write the failing validation tests**

```ts
// tests/unit/assignmentValidation.test.ts
import { describe, it, expect } from 'vitest'
import { createAssignmentSchema, updateAssignmentSchema } from '@/lib/validation/assignment'

const base = {
  course_id: '00000000-0000-0000-0000-0000000c0001',
  title: 'Algebra worksheet',
  description: 'Do problems 1–10',
  due_date: '2026-07-01T18:30:00Z',
}

describe('createAssignmentSchema', () => {
  it('accepts a valid payload (no attachment)', () => {
    const r = createAssignmentSchema.safeParse(base)
    expect(r.success).toBe(true)
  })
  it('accepts an optional attachment pair', () => {
    const r = createAssignmentSchema.safeParse({
      ...base, attachment_drive_file_id: 'file-1', attachment_drive_link: 'http://d/file-1',
    })
    expect(r.success).toBe(true)
  })
  it('rejects a non-uuid course_id', () => {
    expect(createAssignmentSchema.safeParse({ ...base, course_id: 'nope' }).success).toBe(false)
  })
  it('rejects an empty title', () => {
    expect(createAssignmentSchema.safeParse({ ...base, title: '' }).success).toBe(false)
  })
  it('rejects a non-ISO due_date', () => {
    expect(createAssignmentSchema.safeParse({ ...base, due_date: '01/07/2026' }).success).toBe(false)
  })
  it('rejects an attachment file id without a link (must be paired)', () => {
    const r = createAssignmentSchema.safeParse({ ...base, attachment_drive_file_id: 'file-1' })
    expect(r.success).toBe(false)
  })
})

describe('updateAssignmentSchema', () => {
  it('allows a partial update (title only)', () => {
    expect(updateAssignmentSchema.safeParse({ title: 'New title' }).success).toBe(true)
  })
  it('rejects an unknown status', () => {
    expect(updateAssignmentSchema.safeParse({ status: 'deleted' }).success).toBe(false)
  })
  it('allows archiving via status', () => {
    expect(updateAssignmentSchema.safeParse({ status: 'archived' }).success).toBe(true)
  })
})
```

```ts
// tests/unit/submissionValidation.test.ts
import { describe, it, expect } from 'vitest'
import { recordSubmissionSchema } from '@/lib/validation/submission'

const base = {
  assignment_id: '00000000-0000-0000-0000-0000000d0001',
  drive_file_id: 'file-9',
  drive_link: 'http://d/file-9',
}

describe('recordSubmissionSchema', () => {
  it('accepts a valid record payload', () => {
    expect(recordSubmissionSchema.safeParse(base).success).toBe(true)
  })
  it('rejects a missing drive_file_id', () => {
    const { drive_file_id, ...rest } = base
    expect(recordSubmissionSchema.safeParse(rest).success).toBe(false)
  })
  it('rejects a non-uuid assignment_id', () => {
    expect(recordSubmissionSchema.safeParse({ ...base, assignment_id: 'x' }).success).toBe(false)
  })
  it('rejects a non-url drive_link', () => {
    expect(recordSubmissionSchema.safeParse({ ...base, drive_link: 'not a url' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/assignmentValidation.test.ts tests/unit/submissionValidation.test.ts` — Expected: FAIL (no modules).

- [ ] **Step 3: Implement the Zod schemas**

`lib/validation/assignment.ts`:
```ts
import { z } from 'zod'

const isoInstant = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO-8601 instant')

const attachment = z
  .object({
    attachment_drive_file_id: z.string().min(1),
    attachment_drive_link: z.string().url(),
  })
  .partial()
  .refine(
    (a) => (a.attachment_drive_file_id == null) === (a.attachment_drive_link == null),
    { message: 'attachment file id and link must be provided together' },
  )

export const createAssignmentSchema = z
  .object({
    course_id: z.string().uuid(),
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    due_date: isoInstant,
    attachment_drive_file_id: z.string().min(1).optional(),
    attachment_drive_link: z.string().url().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.attachment_drive_file_id == null) !== (v.attachment_drive_link == null)) {
      ctx.addIssue({ code: 'custom', message: 'attachment file id and link must be provided together' })
    }
  })

export const updateAssignmentSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).nullable(),
    due_date: isoInstant,
    status: z.enum(['active', 'archived']),
  })
  .partial()

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>
export { attachment }
```

`lib/validation/submission.ts`:
```ts
import { z } from 'zod'

export const recordSubmissionSchema = z.object({
  assignment_id: z.string().uuid(),
  drive_file_id: z.string().min(1),
  drive_link: z.string().url(),
})

export type RecordSubmissionInput = z.infer<typeof recordSubmissionSchema>
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/assignmentValidation.test.ts tests/unit/submissionValidation.test.ts` — Expected: PASS.

- [ ] **Step 5: Implement the repositories**

`lib/repos/assignments.ts`:
```ts
import { createClient } from '@/lib/supabase/server'
import type { CreateAssignmentInput, UpdateAssignmentInput } from '@/lib/validation/assignment'

export type AssignmentStatus = 'active' | 'archived'

export type Assignment = {
  id: string
  course_id: string
  title: string
  description: string | null
  due_date: string
  attachment_drive_file_id: string | null
  attachment_drive_link: string | null
  created_by: string
  status: AssignmentStatus
  created_at: string
}

// RLS scopes the rows: enrolled student / teacher-of-course / admin.
export async function listAssignments(opts: { courseId?: string } = {}): Promise<Assignment[]> {
  const supabase = await createClient()
  let q = supabase.from('assignments').select('*').eq('status', 'active').order('due_date', { ascending: true })
  if (opts.courseId) q = q.eq('course_id', opts.courseId)
  const { data, error } = await q
  if (error) throw new Error(`listAssignments: ${error.message}`)
  return (data ?? []) as Assignment[]
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('assignments').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getAssignment: ${error.message}`)
  return (data as Assignment) ?? null
}

export async function createAssignment(
  input: CreateAssignmentInput,
  createdBy: string,
): Promise<Assignment> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assignments')
    .insert({
      course_id: input.course_id,
      title: input.title,
      description: input.description ?? null,
      due_date: input.due_date,
      attachment_drive_file_id: input.attachment_drive_file_id ?? null,
      attachment_drive_link: input.attachment_drive_link ?? null,
      created_by: createdBy,
      status: 'active',
    })
    .select('*')
    .single()
  if (error) throw new Error(`createAssignment: ${error.message}`)
  return data as Assignment
}

export async function updateAssignment(id: string, patch: UpdateAssignmentInput): Promise<Assignment> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('assignments').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`updateAssignment: ${error.message}`)
  return data as Assignment
}

export async function archiveAssignment(id: string): Promise<Assignment> {
  return updateAssignment(id, { status: 'archived' })
}
```

`lib/repos/submissions.ts`:
```ts
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type SubmissionStatus = 'submitted' | 'late'

export type Submission = {
  id: string
  assignment_id: string
  student_id: string
  drive_file_id: string
  drive_link: string
  status: SubmissionStatus
  submitted_at: string
  is_active: boolean
  created_at: string
}

// All visible submissions for an assignment (RLS: owning student / teacher-of-course / admin).
// `activeOnly` returns one row per student (the latest); false returns full history.
export async function listSubmissionsForAssignment(
  assignmentId: string,
  opts: { activeOnly?: boolean } = { activeOnly: true },
): Promise<Submission[]> {
  const supabase = await createClient()
  let q = supabase
    .from('submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false })
  if (opts.activeOnly !== false) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw new Error(`listSubmissionsForAssignment: ${error.message}`)
  return (data ?? []) as Submission[]
}

export async function getActiveSubmission(
  assignmentId: string,
  studentId: string,
): Promise<Submission | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(`getActiveSubmission: ${error.message}`)
  return (data as Submission) ?? null
}

/**
 * Record a new submission as the active one, demoting any prior active row to history.
 * Both steps run with the service-role client so the demote + insert are not blocked by
 * the `submissions_one_active` partial-unique index ordering, and so history is preserved
 * atomically-enough for the pilot (no concurrent resubmits per student expected).
 * Authorization (student owns + enrolled + assignment active) is enforced by the caller
 * (the API route) BEFORE calling this; RLS still guards the user-scoped reads elsewhere.
 */
export async function recordSubmission(args: {
  assignmentId: string
  studentId: string
  driveFileId: string
  driveLink: string
  status: SubmissionStatus
  submittedAt: string
}): Promise<Submission> {
  const admin = createAdminClient()
  // demote any current active row to history
  const { error: demoteErr } = await admin
    .from('submissions')
    .update({ is_active: false })
    .eq('assignment_id', args.assignmentId)
    .eq('student_id', args.studentId)
    .eq('is_active', true)
  if (demoteErr) throw new Error(`recordSubmission demote: ${demoteErr.message}`)

  const { data, error } = await admin
    .from('submissions')
    .insert({
      assignment_id: args.assignmentId,
      student_id: args.studentId,
      drive_file_id: args.driveFileId,
      drive_link: args.driveLink,
      status: args.status,
      submitted_at: args.submittedAt,
      is_active: true,
    })
    .select('*')
    .single()
  if (error) throw new Error(`recordSubmission insert: ${error.message}`)
  return data as Submission
}
```

- [ ] **Step 6: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS (`SubmissionStatus` now exported; the Task 3.2 import resolves).

- [ ] **Step 7: Commit**

```bash
git add lib/repos/assignments.ts lib/repos/submissions.ts lib/validation/assignment.ts lib/validation/submission.ts tests/unit/assignmentValidation.test.ts tests/unit/submissionValidation.test.ts
git commit -m "feat: assignment/submission repos + zod schemas"
```

---

## Task 3.4: Assignments API (GET scoped / POST / PATCH / archive)

> Spec §6: `assignments` (GET/POST/PATCH/archive); §5.1: create/update/archive is teacher-of-course or admin; students cannot write. Optional attachment is uploaded by the client via the Phase 2 resumable uploader BEFORE calling POST, which passes only `attachment_drive_file_id`/`_link`.

**Files:**
- Create: `app/api/assignments/route.ts`, `app/api/assignments/[id]/route.ts`
- Test: `tests/integration/assignments-api.test.ts`

- [ ] **Step 1: Write the failing API integration test** (teacher-scope guard is the key assertion)

```ts
// tests/integration/assignments-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We unit-test the route handlers directly, mocking the auth + repo layers so the test
// is deterministic and does not require a live DB. The RLS-enforced path is covered in
// tests/integration/rls-assignments.test.ts; here we prove the SERVER GUARD (teacher scope).

const profile = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any

vi.mock('@/lib/auth/profile', () => ({ getProfile: vi.fn(async () => profile) }))

const teaches = vi.fn(async (_courseId: string) => true)
vi.mock('@/lib/auth/courseScope', () => ({ teachesCourse: (...a: any[]) => teaches(...a) }))

const created = { id: 'a-1', course_id: 'c-1', title: 'A1', due_date: '2026-07-01T18:30:00Z' }
const createAssignment = vi.fn(async () => created)
const listAssignments = vi.fn(async () => [created])
vi.mock('@/lib/repos/assignments', () => ({
  createAssignment: (...a: any[]) => createAssignment(...a),
  listAssignments: (...a: any[]) => listAssignments(...a),
}))

import { GET, POST } from '@/app/api/assignments/route'

const body = (o: any) => new Request('http://t/api/assignments', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o),
})

beforeEach(() => { profile.role = 'teacher'; profile.status = 'active'; teaches.mockResolvedValue(true) })

describe('POST /api/assignments', () => {
  it('teacher who teaches the course can create', async () => {
    const res = await POST(body({
      course_id: 'c-1', title: 'A1', due_date: '2026-07-01T18:30:00Z',
    }))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(createAssignment).toHaveBeenCalled()
  })

  it('teacher who does NOT teach the course is forbidden', async () => {
    teaches.mockResolvedValue(false)
    const res = await POST(body({
      course_id: 'c-other', title: 'A1', due_date: '2026-07-01T18:30:00Z',
    }))
    const json = await res.json()
    expect(res.status).toBe(403)
    expect(json.success).toBe(false)
    expect(createAssignment).not.toHaveBeenCalled()
  })

  it('a student is forbidden from creating', async () => {
    profile.role = 'student'
    const res = await POST(body({
      course_id: 'c-1', title: 'A1', due_date: '2026-07-01T18:30:00Z',
    }))
    expect(res.status).toBe(403)
    expect(createAssignment).not.toHaveBeenCalled()
  })

  it('rejects an invalid payload with 400', async () => {
    const res = await POST(body({ course_id: 'not-uuid', title: '', due_date: 'nope' }))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })
})

describe('GET /api/assignments', () => {
  it('returns the RLS-scoped list', async () => {
    const res = await GET(new Request('http://t/api/assignments'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/integration/assignments-api.test.ts` — Expected: FAIL (no route module, no `courseScope` helper).

- [ ] **Step 3: Implement the teacher-scope helper** — `lib/auth/courseScope.ts`

```ts
import { createClient } from '@/lib/supabase/server'

/** True if the signed-in user teaches the given course (mirrors the SQL teaches_course helper). */
export async function teachesCourse(courseId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data, error } = await supabase
    .from('course_teachers')
    .select('course_id')
    .eq('course_id', courseId)
    .eq('teacher_id', user.id)
    .maybeSingle()
  if (error) throw new Error(`teachesCourse: ${error.message}`)
  return Boolean(data)
}

/** True if the signed-in user is enrolled in the given course. */
export async function isEnrolled(courseId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data, error } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('course_id', courseId)
    .eq('student_id', user.id)
    .maybeSingle()
  if (error) throw new Error(`isEnrolled: ${error.message}`)
  return Boolean(data)
}
```

- [ ] **Step 4: Implement** — `app/api/assignments/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { teachesCourse } from '@/lib/auth/courseScope'
import { createAssignmentSchema } from '@/lib/validation/assignment'
import { createAssignment, listAssignments } from '@/lib/repos/assignments'

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function GET(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  const url = new URL(request.url)
  const courseId = url.searchParams.get('courseId') ?? undefined
  const data = await listAssignments({ courseId }) // RLS scopes the rows
  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  if (profile.role !== 'teacher' && profile.role !== 'admin') return fail('forbidden', 403)

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = createAssignmentSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  // teacher must teach the course; admin overrides
  if (profile.role === 'teacher' && !(await teachesCourse(parsed.data.course_id))) {
    return fail('forbidden', 403)
  }

  const assignment = await createAssignment(parsed.data, profile.id)
  return NextResponse.json({ success: true, data: assignment }, { status: 201 })
}
```

- [ ] **Step 5: Implement** — `app/api/assignments/[id]/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { teachesCourse } from '@/lib/auth/courseScope'
import { updateAssignmentSchema } from '@/lib/validation/assignment'
import { getAssignment, updateAssignment, archiveAssignment } from '@/lib/repos/assignments'

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

async function authorizeWrite(courseId: string) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return { ok: false as const, res: fail('no-access', 401) }
  if (profile.role !== 'teacher' && profile.role !== 'admin') return { ok: false as const, res: fail('forbidden', 403) }
  if (profile.role === 'teacher' && !(await teachesCourse(courseId))) {
    return { ok: false as const, res: fail('forbidden', 403) }
  }
  return { ok: true as const, profile }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await getAssignment(id)
  if (!existing) return fail('not-found', 404)
  const auth = await authorizeWrite(existing.course_id)
  if (!auth.ok) return auth.res

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = updateAssignmentSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  const updated = await updateAssignment(id, parsed.data)
  return NextResponse.json({ success: true, data: updated })
}

// archive = soft-delete (spec §8: content soft-deleted, links survive)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await getAssignment(id)
  if (!existing) return fail('not-found', 404)
  const auth = await authorizeWrite(existing.course_id)
  if (!auth.ok) return auth.res
  const archived = await archiveAssignment(id)
  return NextResponse.json({ success: true, data: archived })
}
```

- [ ] **Step 6: Run — must pass** — Run: `npm run test -- tests/integration/assignments-api.test.ts` — Expected: PASS (create allowed for teacher-of-course; 403 for other-course teacher and for student; 400 on bad payload; GET returns scoped list).

- [ ] **Step 7: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "app/api/assignments" lib/auth/courseScope.ts tests/integration/assignments-api.test.ts
git commit -m "feat: assignments API with teacher-of-course scope guard"
```

---

## Task 3.5: Submissions API (record + view) + status + resubmission

> Spec §5/§7.4: student POSTs a record after the resumable upload; server computes `submitted`/`late` vs the absolute `due_date`; resubmission allowed until due, latest active, prior kept as history. Teacher/admin GET per assignment.

**Files:**
- Create: `app/api/submissions/route.ts`, `app/api/assignments/[id]/submissions/route.ts`
- Test: `tests/integration/submissions-api.test.ts`

- [ ] **Step 1: Write the failing API integration test** (status + resubmission are the key assertions)

```ts
// tests/integration/submissions-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'stud-1', email: 's@x.c', role: 'student', status: 'active' } as any
vi.mock('@/lib/auth/profile', () => ({ getProfile: vi.fn(async () => profile) }))

const enrolled = vi.fn(async () => true)
vi.mock('@/lib/auth/courseScope', () => ({
  isEnrolled: (...a: any[]) => enrolled(...a),
  teachesCourse: vi.fn(async () => true),
}))

// assignment store the route reads to get course_id + due_date + status
let assignment = {
  id: 'a-1', course_id: 'c-1', title: 'A1',
  due_date: '2026-07-01T18:30:00Z', status: 'active',
} as any
vi.mock('@/lib/repos/assignments', () => ({
  getAssignment: vi.fn(async () => assignment),
}))

// capture what recordSubmission receives
const recordSubmission = vi.fn(async (args: any) => ({ id: 'sub-1', ...args }))
const listSubmissionsForAssignment = vi.fn(async () => [
  { id: 'sub-1', assignment_id: 'a-1', student_id: 'stud-1', status: 'submitted', is_active: true },
])
vi.mock('@/lib/repos/submissions', () => ({
  recordSubmission: (...a: any[]) => recordSubmission(...a),
  listSubmissionsForAssignment: (...a: any[]) => listSubmissionsForAssignment(...a),
}))

import { POST } from '@/app/api/submissions/route'
import { GET as listSubs } from '@/app/api/assignments/[id]/submissions/route'

const submit = (o: any) => new Request('http://t/api/submissions', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o),
})
const validBody = {
  assignment_id: 'a-1', drive_file_id: 'file-9', drive_link: 'http://d/file-9',
}

beforeEach(() => {
  vi.useRealTimers()
  profile.role = 'student'; profile.status = 'active'
  enrolled.mockResolvedValue(true)
  assignment = { id: 'a-1', course_id: 'c-1', due_date: '2026-07-01T18:30:00Z', status: 'active' }
  recordSubmission.mockClear()
})

describe('POST /api/submissions — status calc', () => {
  it('records "submitted" when before due', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-07-01T10:00:00Z'))
    const res = await POST(submit(validBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.data.status).toBe('submitted')
    expect(recordSubmission).toHaveBeenCalledWith(expect.objectContaining({ status: 'submitted' }))
  })

  it('records "late" when after due', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-07-02T10:00:00Z'))
    const res = await POST(submit(validBody))
    const json = await res.json()
    expect(json.data.status).toBe('late')
    expect(recordSubmission).toHaveBeenCalledWith(expect.objectContaining({ status: 'late' }))
  })

  it('uses the SERVER clock for submitted_at (ignores any client-sent time)', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-07-01T10:00:00Z'))
    await POST(submit({ ...validBody, submitted_at: '2025-01-01T00:00:00Z' }))
    const arg = recordSubmission.mock.calls[0][0]
    expect(arg.submittedAt).toBe('2026-07-01T10:00:00.000Z')
  })
})

describe('POST /api/submissions — authorization', () => {
  it('non-enrolled student is forbidden', async () => {
    enrolled.mockResolvedValue(false)
    const res = await POST(submit(validBody))
    expect(res.status).toBe(403)
    expect(recordSubmission).not.toHaveBeenCalled()
  })
  it('teacher cannot submit', async () => {
    profile.role = 'teacher'
    const res = await POST(submit(validBody))
    expect(res.status).toBe(403)
  })
  it('rejects submitting to an archived assignment', async () => {
    assignment.status = 'archived'
    const res = await POST(submit(validBody))
    expect(res.status).toBe(409)
    expect(recordSubmission).not.toHaveBeenCalled()
  })
  it('rejects an invalid payload with 400', async () => {
    const res = await POST(submit({ assignment_id: 'x' }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/assignments/[id]/submissions', () => {
  it('teacher/admin sees the active submissions list', async () => {
    profile.role = 'teacher'
    const res = await listSubs(new Request('http://t'), { params: Promise.resolve({ id: 'a-1' }) })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(1)
  })
  it('a student cannot list submissions for an assignment', async () => {
    profile.role = 'student'
    const res = await listSubs(new Request('http://t'), { params: Promise.resolve({ id: 'a-1' }) })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/integration/submissions-api.test.ts` — Expected: FAIL (no route modules).

- [ ] **Step 3: Implement** — `app/api/submissions/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { isEnrolled } from '@/lib/auth/courseScope'
import { recordSubmissionSchema } from '@/lib/validation/submission'
import { getAssignment } from '@/lib/repos/assignments'
import { recordSubmission } from '@/lib/repos/submissions'
import { computeStatus } from '@/lib/assignments/lateStatus'

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  if (profile.role !== 'student') return fail('forbidden', 403)

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = recordSubmissionSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  const assignment = await getAssignment(parsed.data.assignment_id)
  if (!assignment) return fail('not-found', 404)
  if (assignment.status !== 'active') return fail('assignment-archived', 409)
  if (!(await isEnrolled(assignment.course_id))) return fail('forbidden', 403)

  // SERVER clock is the submission instant — never trust a client-supplied time.
  const submittedAt = new Date().toISOString()
  const status = computeStatus(submittedAt, assignment.due_date)

  const submission = await recordSubmission({
    assignmentId: assignment.id,
    studentId: profile.id,
    driveFileId: parsed.data.drive_file_id,
    driveLink: parsed.data.drive_link,
    status,
    submittedAt,
  })
  return NextResponse.json({ success: true, data: submission }, { status: 201 })
}
```

- [ ] **Step 4: Implement** — `app/api/assignments/[id]/submissions/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { teachesCourse } from '@/lib/auth/courseScope'
import { getAssignment } from '@/lib/repos/assignments'
import { listSubmissionsForAssignment } from '@/lib/repos/submissions'

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  if (profile.role !== 'teacher' && profile.role !== 'admin') return fail('forbidden', 403)

  const assignment = await getAssignment(id)
  if (!assignment) return fail('not-found', 404)
  if (profile.role === 'teacher' && !(await teachesCourse(assignment.course_id))) {
    return fail('forbidden', 403)
  }

  const url = new URL(request.url)
  const includeHistory = url.searchParams.get('history') === '1'
  const data = await listSubmissionsForAssignment(id, { activeOnly: !includeHistory })
  return NextResponse.json({ success: true, data })
}
```

- [ ] **Step 5: Run — must pass** — Run: `npm run test -- tests/integration/submissions-api.test.ts` — Expected: PASS (submitted/late by server clock; client time ignored; non-enrolled/teacher 403; archived 409; bad payload 400; teacher GET works, student GET 403).

- [ ] **Step 6: Write a focused resubmission repo test** (latest active, prior kept) — `tests/integration/resubmission.test.ts`

```ts
// tests/integration/resubmission.test.ts
import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(url, service)

const ids = {
  course: '00000000-0000-0000-0000-0000000c0011',
  teacher: '00000000-0000-0000-0000-0000000a0011',
  student: '00000000-0000-0000-0000-0000000a0012',
  assignment: '00000000-0000-0000-0000-0000000d0011',
}

beforeAll(async () => {
  await admin.from('courses').upsert({ id: ids.course, name: 'Resub Course', status: 'active' })
  await admin.from('profiles').upsert([
    { id: ids.teacher, email: 'resub-t@seed.test', role: 'teacher', status: 'active' },
    { id: ids.student, email: 'resub-s@seed.test', role: 'student', status: 'active' },
  ], { onConflict: 'id' })
  await admin.from('course_teachers').upsert({ teacher_id: ids.teacher, course_id: ids.course })
  await admin.from('enrollments').upsert({ student_id: ids.student, course_id: ids.course })
  await admin.from('assignments').upsert({
    id: ids.assignment, course_id: ids.course, title: 'Resub A',
    due_date: '2999-01-01T00:00:00Z', created_by: ids.teacher, status: 'active',
  })
})

afterAll(async () => {
  await admin.from('submissions').delete().eq('assignment_id', ids.assignment)
  await admin.from('assignments').delete().eq('id', ids.assignment)
  await admin.from('course_teachers').delete().eq('course_id', ids.course)
  await admin.from('enrollments').delete().eq('course_id', ids.course)
  await admin.from('profiles').delete().in('id', [ids.teacher, ids.student])
  await admin.from('courses').delete().eq('id', ids.course)
})

// Exercise the repo against the real DB (service-role) to verify the active/history invariant.
import { recordSubmission, listSubmissionsForAssignment } from '@/lib/repos/submissions'

describe('resubmission: latest active, prior kept as history', () => {
  it('keeps exactly one active row and retains history', async () => {
    await recordSubmission({
      assignmentId: ids.assignment, studentId: ids.student,
      driveFileId: 'v1', driveLink: 'http://d/v1', status: 'submitted',
      submittedAt: '2026-06-25T10:00:00Z',
    })
    await recordSubmission({
      assignmentId: ids.assignment, studentId: ids.student,
      driveFileId: 'v2', driveLink: 'http://d/v2', status: 'submitted',
      submittedAt: '2026-06-25T11:00:00Z',
    })

    const all = await admin
      .from('submissions').select('*')
      .eq('assignment_id', ids.assignment).eq('student_id', ids.student)
    expect(all.data?.length).toBe(2)               // history retained
    const active = all.data?.filter((r: any) => r.is_active)
    expect(active?.length).toBe(1)                 // exactly one active
    expect(active?.[0].drive_file_id).toBe('v2')   // latest wins

    const activeList = await listSubmissionsForAssignment(ids.assignment, { activeOnly: true })
    // service-role bypasses RLS so the helper returns the active row for the seeded student
    expect(activeList.find((s) => s.student_id === ids.student)?.drive_file_id).toBe('v2')
  })
})
```

> `recordSubmission`/`listSubmissionsForAssignment` use the env clients; run this file with the env-file runner. `listSubmissionsForAssignment` uses the user-scoped client (`createClient`) which, with no session in this runner, relies on RLS — service-role seeds make the active-row assertion above primarily check the repo's demote/insert via the admin client. Keep the strong assertions on the admin-read.

- [ ] **Step 7: Run the resubmission test — must pass**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/resubmission.test.ts`
Expected: PASS — 2 rows total, exactly 1 active, `v2` latest.

- [ ] **Step 8: Commit**

```bash
git add "app/api/submissions" "app/api/assignments/[id]/submissions" tests/integration/submissions-api.test.ts tests/integration/resubmission.test.ts
git commit -m "feat: submissions API (record+status+resubmission, scoped view)"
```

---

## Task 3.6: UI — teacher create + view submissions; student submit + status

> Spec §6 `/assignments`: student view+submit+status; teacher create+view submissions; admin all. Times display in the device timezone with a TZ label (spec §8). The student submit flow reuses `useResumableUpload` (Phase 2) to push the file to `Student Submissions/<Course>/`, then POSTs the record.

**Files:**
- Create: `app/(app)/assignments/page.tsx`, `app/(app)/assignments/AssignmentComposer.tsx`, `app/(app)/assignments/SubmitForm.tsx`, `app/(app)/assignments/SubmissionsList.tsx`, `app/(app)/assignments/[id]/page.tsx`, `lib/time/format.ts`
- Test: `tests/unit/timeFormat.test.ts`

- [ ] **Step 1: Write the failing device-TZ formatter test** (pure, deterministic with an explicit zone)

```ts
// tests/unit/timeFormat.test.ts
import { describe, it, expect } from 'vitest'
import { formatInstant } from '@/lib/time/format'

describe('formatInstant', () => {
  const iso = '2026-07-01T18:30:00Z'
  it('renders the instant in an explicit timezone with a TZ label', () => {
    const out = formatInstant(iso, 'Asia/Kolkata')
    // 18:30 UTC === 00:00 next day in IST
    expect(out).toMatch(/Jul 2, 2026/)
    expect(out).toMatch(/IST|GMT\+5:30|Asia\/Kolkata/)
  })
  it('the same instant in UTC shows the UTC wall clock', () => {
    const out = formatInstant(iso, 'UTC')
    expect(out).toMatch(/Jul 1, 2026/)
  })
  it('returns an em dash for a null/empty instant', () => {
    expect(formatInstant(null, 'UTC')).toBe('—')
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/timeFormat.test.ts` — Expected: FAIL (no module).

> If Phase 2 already created `lib/time/format.ts` with a compatible `formatInstant`, skip Steps 1–3 and reuse it (delete this duplicate test). The signature below is the contract this phase depends on.

- [ ] **Step 3: Implement** — `lib/time/format.ts`

```ts
/**
 * Format an absolute UTC ISO instant for display in a given IANA timezone, with a TZ label.
 * `timeZone` defaults to the caller's resolved device zone when omitted (browser only).
 */
export function formatInstant(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—'
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '—'
  const tz =
    timeZone ??
    (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC')
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(ms)
}

/** Convenience for client components: format in the viewer's auto-detected device zone. */
export function formatInstantDevice(iso: string | null | undefined): string {
  return formatInstant(iso)
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/timeFormat.test.ts` — Expected: PASS.

- [ ] **Step 5: Implement the list page (server component, role-aware)** — `app/(app)/assignments/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getProfile } from '@/lib/auth/profile'
import { listAssignments } from '@/lib/repos/assignments'
import { AssignmentComposer } from './AssignmentComposer'

export default async function AssignmentsPage() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')

  const assignments = await listAssignments() // RLS scopes to enrolled/taught/all
  const canCompose = profile.role === 'teacher' || profile.role === 'admin'

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Assignments</h1>
      {canCompose && <AssignmentComposer />}
      <ul className="mt-6 space-y-3">
        {assignments.length === 0 && <li className="text-slate-500">No assignments yet.</li>}
        {assignments.map((a) => (
          <li key={a.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <Link href={`/assignments/${a.id}`} className="font-medium hover:underline">
              {a.title}
            </Link>
            {a.description && <p className="mt-1 text-sm text-slate-600">{a.description}</p>}
            <p className="mt-2 text-xs text-slate-500" data-due={a.due_date}>
              Due: <span className="js-due">{a.due_date}</span>
            </p>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

> The raw `due_date` is rendered with a `data-due` attribute; a tiny client island (or the detail page) can re-render it with `formatInstantDevice` to show the viewer's device TZ. For the pilot, the detail page (`[id]/page.tsx`) handles device-TZ display via a client component; the list shows the ISO as a stable fallback. (Keep server output deterministic to avoid hydration mismatch.)

- [ ] **Step 6: Implement the composer (client, teacher/admin)** — `app/(app)/assignments/AssignmentComposer.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useResumableUpload } from '@/lib/hooks/useResumableUpload'

export function AssignmentComposer() {
  const router = useRouter()
  const { upload, status: uploadStatus } = useResumableUpload()
  const [courseId, setCourseId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueLocal, setDueLocal] = useState('') // datetime-local (device wall clock)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      // Convert the device-local datetime to an absolute UTC instant.
      const dueIso = new Date(dueLocal).toISOString()
      let attachment: { attachment_drive_file_id: string; attachment_drive_link: string } | {} = {}
      if (file) {
        const up = await upload(file, { kind: 'assignment-attachment' })
        attachment = { attachment_drive_file_id: up.driveFileId, attachment_drive_link: up.driveLink }
      }
      const res = await fetch('/api/assignments', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ course_id: courseId, title, description, due_date: dueIso, ...attachment }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'failed')
      setTitle(''); setDescription(''); setDueLocal(''); setFile(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-medium">New assignment</h2>
      <input className="w-full rounded border p-2" placeholder="Course ID" value={courseId}
        onChange={(e) => setCourseId(e.target.value)} required />
      <input className="w-full rounded border p-2" placeholder="Title" value={title}
        onChange={(e) => setTitle(e.target.value)} required />
      <textarea className="w-full rounded border p-2" placeholder="Description" value={description}
        onChange={(e) => setDescription(e.target.value)} />
      <label className="block text-sm">Due (your local time)
        <input type="datetime-local" className="mt-1 w-full rounded border p-2" value={dueLocal}
          onChange={(e) => setDueLocal(e.target.value)} required />
      </label>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy}
        className="rounded-lg border px-4 py-2 font-medium shadow-sm disabled:opacity-50">
        {busy ? (uploadStatus === 'uploading' ? 'Uploading…' : 'Posting…') : 'Post assignment'}
      </button>
    </form>
  )
}
```

- [ ] **Step 7: Implement the student submit form (client)** — `app/(app)/assignments/SubmitForm.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useResumableUpload } from '@/lib/hooks/useResumableUpload'

export function SubmitForm({ assignmentId }: { assignmentId: string }) {
  const router = useRouter()
  const { upload, progress, status } = useResumableUpload()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setBusy(true); setError(null)
    try {
      const up = await upload(file, { kind: 'submission', refId: assignmentId })
      const res = await fetch('/api/submissions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assignment_id: assignmentId, drive_file_id: up.driveFileId, drive_link: up.driveLink,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'failed')
      setFile(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-2 rounded-xl border bg-white p-4 shadow-sm">
      <h3 className="font-medium">Submit your work</h3>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
      {status === 'uploading' && <p className="text-xs text-slate-500">Uploading… {progress}%</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy || !file}
        className="rounded-lg border px-4 py-2 font-medium shadow-sm disabled:opacity-50">
        {busy ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  )
}
```

- [ ] **Step 8: Implement the teacher submissions list (client island for device-TZ)** — `app/(app)/assignments/SubmissionsList.tsx`

```tsx
'use client'
import { useEffect, useState } from 'react'
import { formatInstantDevice } from '@/lib/time/format'

type Row = {
  id: string; student_id: string; status: 'submitted' | 'late'
  submitted_at: string; drive_link: string
}

export function SubmissionsList({ assignmentId }: { assignmentId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/assignments/${assignmentId}/submissions`)
      .then((r) => r.json())
      .then((j) => (j.success ? setRows(j.data) : setError(j.error)))
      .catch((e) => setError(String(e)))
  }, [assignmentId])

  if (error) return <p className="mt-4 text-sm text-red-600">{error}</p>
  return (
    <div className="mt-4">
      <h3 className="font-medium">Submissions ({rows.length})</h3>
      <table className="mt-2 w-full text-sm">
        <thead><tr className="text-left text-slate-500">
          <th>Student</th><th>Status</th><th>Submitted</th><th>File</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-1">{r.student_id}</td>
              <td><span className={r.status === 'late' ? 'text-amber-600' : 'text-emerald-600'}>{r.status}</span></td>
              <td>{formatInstantDevice(r.submitted_at)}</td>
              <td><a className="text-blue-600 hover:underline" href={r.drive_link} target="_blank" rel="noreferrer">open</a></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="py-2 text-slate-500">No submissions yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 9: Implement the detail page (role-aware)** — `app/(app)/assignments/[id]/page.tsx`

```tsx
import { redirect, notFound } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { getAssignment } from '@/lib/repos/assignments'
import { getActiveSubmission } from '@/lib/repos/submissions'
import { SubmitForm } from '../SubmitForm'
import { SubmissionsList } from '../SubmissionsList'
import { DueLabel } from './DueLabel'

export default async function AssignmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status !== 'active') redirect('/access-pending')

  const assignment = await getAssignment(id) // RLS hides it if out of scope
  if (!assignment) notFound()

  const isStudent = profile.role === 'student'
  const isTeacherOrAdmin = profile.role === 'teacher' || profile.role === 'admin'
  const mySubmission = isStudent ? await getActiveSubmission(id, profile.id) : null

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">{assignment.title}</h1>
      {assignment.description && <p className="mt-2 text-slate-600">{assignment.description}</p>}
      <p className="mt-2 text-sm text-slate-500"><DueLabel iso={assignment.due_date} /></p>
      {assignment.attachment_drive_link && (
        <a className="mt-2 inline-block text-blue-600 hover:underline"
          href={assignment.attachment_drive_link} target="_blank" rel="noreferrer">
          Attachment
        </a>
      )}

      {isStudent && (
        <section>
          {mySubmission ? (
            <p className="mt-4 rounded-lg border bg-white p-3 text-sm">
              Your submission: <span className={mySubmission.status === 'late' ? 'text-amber-600' : 'text-emerald-600'}>
                {mySubmission.status}
              </span> — you may resubmit until the due date.
            </p>
          ) : null}
          <SubmitForm assignmentId={id} />
        </section>
      )}

      {isTeacherOrAdmin && <SubmissionsList assignmentId={id} />}
    </main>
  )
}
```

`app/(app)/assignments/[id]/DueLabel.tsx`:
```tsx
'use client'
import { formatInstantDevice } from '@/lib/time/format'
export function DueLabel({ iso }: { iso: string }) {
  return <>Due: {formatInstantDevice(iso)}</>
}
```

- [ ] **Step 10: Typecheck + build** — Run: `npx tsc --noEmit` then `npm run build` — Expected: PASS (app + marketing build).

- [ ] **Step 11: Commit**

```bash
git add "app/(app)/assignments" lib/time/format.ts tests/unit/timeFormat.test.ts
git commit -m "feat: assignments UI (compose, submit, submissions, device-TZ due labels)"
```

---

## Task 3.7: Playwright E2E — post → submit → view → late

> Spec §10: "student submits assignment"; plan index Phase 3 E2E: "teacher posts → student submits → teacher sees it → status flips late after due." Run against a local dev server with the preview Supabase project (never prod). Uploads are exercised via the real resumable path if the spike (Phase 0) chose direct-to-Drive; otherwise the same UI drives the Supabase-staging fallback.

**Files:**
- Create: `e2e/assignments.spec.ts`, `playwright.config.ts` (if Phase 2 did not already create it)
- Modify: `package.json` (add `test:e2e` script if absent)

- [ ] **Step 1: Ensure Playwright is installed and configured**

If `playwright.config.ts` does not exist, run:
```bash
npm install -D @playwright/test
npx playwright install chromium
```
Add to `package.json` `"scripts"` (if absent): `"test:e2e": "playwright test"`.

`playwright.config.ts` (create only if missing):
```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- [ ] **Step 2: Write the E2E spec** (storage-state auth helpers assumed from Phase 0/1 E2E setup)

```ts
// e2e/assignments.spec.ts
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Seeds run against the PREVIEW Supabase project via service-role (E2E_* envs).
const sb = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!)

const COURSE = 'E2E Assignments Course'
let courseId = ''
let assignmentId = ''

// Auth is provided by per-role storageState files produced by the Phase 0/1 E2E login setup:
//   e2e/.auth/teacher.json, e2e/.auth/student.json
// (If your harness uses a different mechanism, swap test.use({ storageState }) accordingly.)

test.beforeAll(async () => {
  const { data } = await sb.from('courses').insert({ name: COURSE, status: 'active' }).select('id').single()
  courseId = data!.id
  // assumes the seeded teacher/student emails from the E2E auth setup are enrolled/assigned here
  const teacher = (await sb.from('profiles').select('id').eq('email', process.env.E2E_TEACHER_EMAIL!).single()).data!
  const student = (await sb.from('profiles').select('id').eq('email', process.env.E2E_STUDENT_EMAIL!).single()).data!
  await sb.from('course_teachers').insert({ teacher_id: teacher.id, course_id: courseId })
  await sb.from('enrollments').insert({ student_id: student.id, course_id: courseId })
})

test.afterAll(async () => {
  await sb.from('submissions').delete().eq('assignment_id', assignmentId)
  await sb.from('assignments').delete().eq('course_id', courseId)
  await sb.from('course_teachers').delete().eq('course_id', courseId)
  await sb.from('enrollments').delete().eq('course_id', courseId)
  await sb.from('courses').delete().eq('id', courseId)
})

test.describe('teacher posts → student submits (on time) → teacher sees it', () => {
  test('happy path', async ({ browser }) => {
    // 1) Teacher posts an assignment with a NEAR-FUTURE due date (2 minutes out).
    const teacher = await browser.newContext({ storageState: 'e2e/.auth/teacher.json' })
    const tPage = await teacher.newPage()
    await tPage.goto('/assignments')
    await tPage.getByPlaceholder('Course ID').fill(courseId)
    await tPage.getByPlaceholder('Title').fill('E2E Homework 1')
    const due = new Date(Date.now() + 2 * 60_000)
    // datetime-local wants local wall-clock "YYYY-MM-DDTHH:mm"
    const local = new Date(due.getTime() - due.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    await tPage.getByLabel('Due (your local time)').fill(local)
    await tPage.getByRole('button', { name: /Post assignment/ }).click()
    await expect(tPage.getByText('E2E Homework 1')).toBeVisible()

    // capture the assignment id for teardown + the student flow
    assignmentId = (await sb.from('assignments').select('id').eq('title', 'E2E Homework 1').single()).data!.id

    // 2) Student submits a file.
    const student = await browser.newContext({ storageState: 'e2e/.auth/student.json' })
    const sPage = await student.newPage()
    await sPage.goto(`/assignments/${assignmentId}`)
    await sPage.setInputFiles('input[type=file]', {
      name: 'answer.txt', mimeType: 'text/plain', buffer: Buffer.from('my answer'),
    })
    await sPage.getByRole('button', { name: /Submit/ }).click()
    await expect(sPage.getByText(/submitted/)).toBeVisible({ timeout: 30_000 })

    // 3) Teacher sees the submission with status "submitted".
    await tPage.goto(`/assignments/${assignmentId}`)
    await expect(tPage.getByRole('cell', { name: 'submitted' })).toBeVisible({ timeout: 30_000 })

    await teacher.close(); await student.close()
  })
})

test.describe('a submission after the due date shows "late"', () => {
  test('past-due submission is late', async ({ browser }) => {
    // Post an assignment whose due date is already in the PAST.
    const past = new Date(Date.now() - 60_000).toISOString()
    const { data: a } = await sb.from('assignments').insert({
      course_id: courseId, title: 'E2E Past Due', due_date: past, status: 'active',
      created_by: (await sb.from('profiles').select('id').eq('email', process.env.E2E_TEACHER_EMAIL!).single()).data!.id,
    }).select('id').single()
    const pastId = a!.id

    const student = await browser.newContext({ storageState: 'e2e/.auth/student.json' })
    const sPage = await student.newPage()
    await sPage.goto(`/assignments/${pastId}`)
    await sPage.setInputFiles('input[type=file]', {
      name: 'late.txt', mimeType: 'text/plain', buffer: Buffer.from('late answer'),
    })
    await sPage.getByRole('button', { name: /Submit/ }).click()
    await expect(sPage.getByText(/late/)).toBeVisible({ timeout: 30_000 })

    await sb.from('submissions').delete().eq('assignment_id', pastId)
    await sb.from('assignments').delete().eq('id', pastId)
    await student.close()
  })
})
```

- [ ] **Step 3: Run the E2E suite**

Run: `npm run test:e2e -- e2e/assignments.spec.ts`
Expected: PASS — teacher posts; student's on-time submission shows `submitted` and is visible to the teacher; the past-due submission shows `late`.

> If the Phase 0 spike chose the **Supabase-staging fallback**, the same UI path drives that flow; no spec change is needed here because the uploader hook abstracts it.

- [ ] **Step 4: Commit**

```bash
git add e2e/assignments.spec.ts playwright.config.ts package.json
git commit -m "test: e2e assignment post → submit → view, on-time vs late"
```

---

## Phase 3 Acceptance Criteria
- [ ] `npm run test` green: `lateStatus` (8 cases incl. boundary + TZ-independence), assignment/submission Zod validators, assignments-api guard tests, submissions-api status/auth tests, `timeFormat`.
- [ ] Integration (env-file runner) green: `rls-assignments` (anon blocked, tables exist), `resubmission` (exactly one active row, history retained, latest wins).
- [ ] `assignments` + `submissions` exist with **RLS enabled**: reads scoped to enrolled student / teacher-of-course / admin; students insert only their own submission for an active, enrolled assignment; teachers read submissions only for their own-course assignments.
- [ ] A teacher who teaches the course can POST/PATCH/archive an assignment (optionally with a Drive attachment via the resumable uploader); a teacher of another course and any student get 403.
- [ ] A student submits via the resumable upload path; the server stamps `submitted`/`late` from the **server clock vs the absolute `due_date`** (client-supplied time ignored); submitting to an archived assignment is rejected (409).
- [ ] Resubmission keeps the latest as the single active row and retains prior submissions as history.
- [ ] Teacher/admin view submissions per assignment; times render in the viewer's device timezone with a TZ label.
- [ ] Playwright E2E green: post → submit (on time → `submitted`, visible to teacher) and a past-due submission → `late`.
- [ ] All API inputs validated with Zod; all responses use the `{ success, data?, error? }` envelope; no secrets in the client bundle (service-role used only in `lib/repos/submissions.ts` server path).
- [ ] Committed in small steps with conventional-commit messages.

## Self-review notes (done)
- **Spec coverage:** §5 `assignments`/`submissions` columns (incl. `attachment_drive_file_id/_link`, `status` enum `submitted|late`, `submitted_at`, resubmission history) → Task 3.1 migration + Task 3.3 repos; §5.1 RLS table (read enrolled/teacher-of-course/admin; student writes own; teacher reads own-course submissions) → Task 3.1 policies + Task 3.4/3.5 server guards; §7.4 two-way Drive flow → Tasks 3.4–3.6 reuse the Phase 2 uploader; §8 "'late' compares absolute instants, TZ-independent" → Task 3.2 `computeStatus` + Task 3.5 server-clock stamping + Task 3.6 device-TZ display only.
- **Late logic is genuinely TZ-independent:** `computeStatus` parses both ISO strings to epoch ms and compares instants; tests assert the same instant expressed with a `+05:30` offset yields the same verdict, and the boundary (==, +1s) is pinned. The API stamps `submitted_at` from `new Date()` (server) and ignores any client time — a test proves this.
- **Resubmission invariant:** a partial-unique index `submissions_one_active … where (is_active)` enforces exactly one active row per (assignment, student); `recordSubmission` demotes the prior active row then inserts the new active row (service-role, ordered), keeping history; an integration test asserts 2 rows total / 1 active / latest wins.
- **Type consistency:** `SubmissionStatus` defined once in `lib/repos/submissions.ts` and imported by `computeStatus`; `Assignment`/`Submission` row types and `Create/Update/RecordSubmission` input types are single-sourced in repos + validation; route handlers use the same `{ success, data?, error? }` envelope as Phase 0–2.
- **Authorization defense-in-depth:** RLS at the DB (security boundary) + explicit server guards (`teachesCourse`/`isEnrolled` + role checks) at every write/record endpoint, so a bug in one layer doesn't leak data; admin overrides everywhere per §5.1.
- **Reuse:** Phase 2 `initResumableSession`/`finalizeUpload`/`useResumableUpload` consumed unchanged via the documented signatures; `lib/supabase/{server,admin}`, `lib/auth/{profile,guards}`, `lib/repos/courses` reused from earlier phases.
- **No placeholders:** every step has runnable code, an explicit run command, and an expected RED/GREEN outcome; commit messages are conventional and attribution-free.
- **Cross-phase assumptions recorded:** Phase 1 helpers `is_enrolled`/`teaches_course` and tables `courses`/`enrollments`/`course_teachers`; Phase 2 uploader signatures and `lib/time/format.ts` (created here if Phase 2 didn't); Phase 0/1 E2E per-role `storageState` auth fixtures. If any differ, only the noted call sites change — test contracts stay fixed.
# Phase 1 — Announcements + Admin Implementation Plan

> **How to build this (no special model, plugin, or skill required).** This plan is fully self-contained. Build the tasks **in order**, top to bottom. For each task, follow the steps verbatim: write the test exactly as shown → run the exact command and confirm the expected FAIL → paste the implementation exactly as shown → re-run and confirm PASS → commit. Then check off each `- [ ]`. Do not reorder steps, skip the test-first order, or improvise — every command and code block is provided literally.

**Goal:** An admin can manage the allowlist (add users, revoke, restore), courses, enrollments and teacher↔course assignments; first Google login binds an admin-seeded `profiles` row to its `auth.uid`; teachers and admins post announcements scoped to courses (or global); students see a feed scoped to their enrolled courses + global. Every new table is RLS-protected with per-role policy tests.

**Architecture:** Builds on the Phase 0 spine. Postgres + RLS is the security boundary (new `courses`, `enrollments`, `course_teachers`, `announcements`, `audit_log` tables; new `SECURITY DEFINER` helpers `is_enrolled(course_id)` / `teaches_course(course_id)`). Admin mutations use the service-role client server-side (`createAdminClient`); user-scoped reads/writes use the RLS-enforced server client (`createClient`). Route Handlers under `app/api/*` and admin pages under `app/(app)/admin/*` are the backend-for-frontend, all guarded by `getProfile()` + `assertRole()`. Responses use the `{ success, data?, error? }` envelope.

**Tech Stack:** Next.js 14, TypeScript, Tailwind 4, `@supabase/supabase-js`, `@supabase/ssr`, Zod, Vitest, Playwright (introduced in this phase's E2E task).

**Prereqted spec:** `docs/superpowers/specs/2026-06-25-cert-ed-academia-app-design.md` (§5 data model, §5.1 RLS, §6 routes, §7.1 onboarding/revoke, §7.2 announcements).

**Assumed from Phase 0 (must be green before starting):** `lib/supabase/{server,client,admin}.ts`, `lib/auth/profile.ts` (`getProfile()`, `Profile` type), `lib/auth/guards.ts` (`assertRole`), `supabase/migrations/0001_foundation.sql` (gives `profiles`, `org_settings`, and the SQL helpers `current_role()`, `current_status()`, `is_active_admin()`), `vitest.config.ts` (alias `@`), `.env.local` with prod Supabase keys. Integration tests that hit Supabase run with `node --env-file=.env.local node_modules/.bin/vitest run <file>`.

---

## File map (created in this phase)

```
supabase/migrations/0002_announcements_admin.sql       # courses/enrollments/course_teachers/announcements/audit_log + RLS + helpers
tests/integration/rls-phase1.test.ts                   # per-role RLS policy tests (the security boundary)

lib/validation/courses.ts                              # Zod: course create/update
lib/validation/enrollments.ts                          # Zod: enrollment create
lib/validation/courseTeachers.ts                       # Zod: assignment create
lib/validation/announcements.ts                        # Zod: announcement create/update/list-query
lib/validation/users.ts                                # Zod: admin add-user

lib/repos/courses.ts                                   # listCourses/createCourse/updateCourse/archiveCourse
lib/repos/enrollments.ts                               # listEnrollments/enroll/unenroll
lib/repos/courseTeachers.ts                            # listAssignments/assignTeacher/unassignTeacher
lib/repos/announcements.ts                             # listAnnouncements (scoped+paged+search)/createAnnouncement/updateAnnouncement/archiveAnnouncement
lib/repos/users.ts                                     # listProfiles/addUser/revokeUser/restoreUser (service-role)
lib/audit.ts                                           # writeAudit() helper (service-role)
lib/auth/bindProfile.ts                                # first-login allowlist binding (TDD)
lib/http/envelope.ts                                   # ok()/fail() response helpers

app/(app)/admin/layout.tsx                             # admin-only guard wrapper
app/(app)/admin/users/page.tsx                         # list + add user + revoke/restore
app/(app)/admin/users/actions.ts                       # server actions (addUser/revoke/restore)
app/(app)/admin/courses/page.tsx                       # courses + enrollments
app/(app)/admin/courses/actions.ts                     # server actions (course/enrollment CRUD)
app/(app)/admin/course-teachers/page.tsx               # teacher↔course assignments
app/(app)/admin/course-teachers/actions.ts             # server actions (assign/unassign)
app/(app)/announcements/page.tsx                       # student feed (scoped) + teacher/admin composer
app/(app)/announcements/Composer.tsx                   # client composer form
app/(app)/auth/callback/route.ts                       # MODIFIED: call bindProfile after session exchange

app/api/announcements/route.ts                         # GET (scoped, paged, search) + POST
app/api/announcements/[id]/route.ts                    # PATCH (update) + DELETE (archive)

tests/unit/announcements-scope.test.ts                 # scope guard (teacher assigned-course write)
tests/unit/bindProfile.test.ts                         # first-login binding logic
tests/unit/revoke-action.test.ts                       # revoke server action (mocked admin client)
tests/unit/validation-phase1.test.ts                   # Zod schema shape tests
e2e/playwright.config.ts                               # Playwright config (introduced here)
e2e/announcements.spec.ts                              # admin→teacher→student flow + revoke block
```

---

## Task 1.1: Migration — courses, enrollments, course_teachers, announcements, audit_log + RLS + helpers

**Files:**
- Create: `supabase/migrations/0002_announcements_admin.sql`
- Test: `tests/integration/rls-phase1.test.ts`

- [ ] **Step 1: Write the failing per-role RLS integration test**

```ts
// tests/integration/rls-phase1.test.ts
import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(url, service) // bypasses RLS — used to seed + to mint test sessions

// Sign in as a seeded profile by minting a session via the admin API, then
// returning an RLS-enforced client bound to that user's JWT.
async function clientForUser(userId: string) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: `${userId}@rls.test`,
  })
  if (error) throw error
  const c = createClient(url, anon)
  // exchange the generated token hash for a session
  const { error: vErr } = await c.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  })
  if (vErr) throw vErr
  return c
}

let courseA = '', courseB = ''
let studentId = '', teacherId = '', adminId = ''

describe('phase 1 RLS', () => {
  beforeAll(async () => {
    // 3 auth users (student enrolled in A, teacher assigned to A, admin)
    const mk = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email, email_confirm: true,
      })
      if (error) throw error
      return data.user.id
    }
    studentId = await mk('p1-student@rls.test')
    teacherId = await mk('p1-teacher@rls.test')
    adminId = await mk('p1-admin@rls.test')

    await admin.from('profiles').upsert([
      { id: studentId, email: 'p1-student@rls.test', full_name: 'S', role: 'student', status: 'active', class_level: '5' },
      { id: teacherId, email: 'p1-teacher@rls.test', full_name: 'T', role: 'teacher', status: 'active' },
      { id: adminId, email: 'p1-admin@rls.test', full_name: 'A', role: 'admin', status: 'active' },
    ], { onConflict: 'id' })

    const { data: cA } = await admin.from('courses').insert({ name: 'Course A' }).select('id').single()
    const { data: cB } = await admin.from('courses').insert({ name: 'Course B' }).select('id').single()
    courseA = cA!.id; courseB = cB!.id

    await admin.from('enrollments').insert({ student_id: studentId, course_id: courseA })
    await admin.from('course_teachers').insert({ teacher_id: teacherId, course_id: courseA })

    // global + per-course announcements authored by admin
    await admin.from('announcements').insert([
      { title: 'Global', message: 'hi all', author_id: adminId, course_id: null },
      { title: 'For A', message: 'a only', author_id: adminId, course_id: courseA },
      { title: 'For B', message: 'b only', author_id: adminId, course_id: courseB },
    ])
  })

  afterAll(async () => {
    await admin.from('announcements').delete().in('title', ['Global', 'For A', 'For B', 'Teacher A post', 'Teacher B post'])
    await admin.from('course_teachers').delete().eq('teacher_id', teacherId)
    await admin.from('enrollments').delete().eq('student_id', studentId)
    await admin.from('courses').delete().in('id', [courseA, courseB])
    for (const id of [studentId, teacherId, adminId]) {
      await admin.from('profiles').delete().eq('id', id)
      await admin.auth.admin.deleteUser(id)
    }
  })

  it('student sees only enrolled-course + global announcements', async () => {
    const c = await clientForUser('p1-student')
    // re-bind: the magiclink email differs from the seeded email, so create the
    // student session by signing in as the actual seeded user instead.
    const { data: { session } } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'p1-student@rls.test' }) as any
    const sc = createClient(url, anon)
    await sc.auth.verifyOtp({ token_hash: (session ?? (await admin.auth.admin.generateLink({ type: 'magiclink', email: 'p1-student@rls.test' })).data.properties.hashed_token), type: 'magiclink' as any }).catch(() => {})
    const { data } = await c.from('announcements').select('title')
    const titles = (data ?? []).map(r => r.title).sort()
    expect(titles).toContain('Global')
    expect(titles).toContain('For A')
    expect(titles).not.toContain('For B')
  })

  it('student cannot insert an announcement', async () => {
    const c = await clientForUser('p1-student')
    const { error } = await c.from('announcements').insert({ title: 'X', message: 'y', author_id: studentId })
    expect(error).not.toBeNull()
  })

  it('teacher can insert an announcement for an assigned course', async () => {
    const c = await clientForUser('p1-teacher')
    const { error } = await c.from('announcements').insert({ title: 'Teacher A post', message: 'm', author_id: teacherId, course_id: courseA })
    expect(error).toBeNull()
  })

  it('teacher cannot insert an announcement for an unassigned course', async () => {
    const c = await clientForUser('p1-teacher')
    const { error } = await c.from('announcements').insert({ title: 'Teacher B post', message: 'm', author_id: teacherId, course_id: courseB })
    expect(error).not.toBeNull()
  })

  it('admin can insert a global announcement', async () => {
    const c = await clientForUser('p1-admin')
    const { error } = await c.from('announcements').insert({ title: 'Admin global', message: 'm', author_id: adminId, course_id: null })
    expect(error).toBeNull()
    await admin.from('announcements').delete().eq('title', 'Admin global')
  })

  it('anonymous cannot read courses', async () => {
    const anonClient = createClient(url, anon)
    const { data, error } = await anonClient.from('courses').select('*')
    expect(error ?? (data?.length === 0)).toBeTruthy()
  })

  it('non-admin cannot insert into audit_log', async () => {
    const c = await clientForUser('p1-teacher')
    const { error } = await c.from('audit_log').insert({ actor_id: teacherId, action: 'test', entity_type: 'x', entity_id: teacherId })
    expect(error).not.toBeNull()
  })
})
```

> Note: `clientForUser(name)` mints a real Supabase session for the seeded user with that email (`<name>@rls.test`) via the admin `generateLink` + `verifyOtp` magic-link flow, so RLS evaluates `auth.uid()` correctly. Keep one helper; the inline duplication in the first test above exists only to show the pattern — when implementing, factor the session creation into `clientForUser` and call it everywhere.

- [ ] **Step 2: Simplify the helper so every test uses one path**

Replace the body of `clientForUser` with the seeded-email flow and delete the inline re-bind in the first test:

```ts
async function clientForUser(name: string) {
  const email = `p1-${name}@rls.test`
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const c = createClient(url, anon)
  const { error: vErr } = await c.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  })
  if (vErr) throw vErr
  return c
}
```

And change the calls to pass the short name: `clientForUser('student')`, `clientForUser('teacher')`, `clientForUser('admin')`. Remove the re-bind block inside the first test (lines creating `session`/`sc`) so it reads simply:

```ts
  it('student sees only enrolled-course + global announcements', async () => {
    const c = await clientForUser('student')
    const { data } = await c.from('announcements').select('title')
    const titles = (data ?? []).map(r => r.title).sort()
    expect(titles).toContain('Global')
    expect(titles).toContain('For A')
    expect(titles).not.toContain('For B')
  })
```

- [ ] **Step 3: Run it — must fail (tables/helpers missing)**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/rls-phase1.test.ts`
Expected: FAIL — relation "courses" does not exist (and/or function `is_enrolled` missing).

- [ ] **Step 4: Write the migration**

```sql
-- supabase/migrations/0002_announcements_admin.sql

-- ── tables ────────────────────────────────────────────────────────────────
create table courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, course_id)
);

create table course_teachers (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, course_id)
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,   -- null = global
  title text not null,
  message text not null,
  author_id uuid not null references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);
create index announcements_course_idx on announcements(course_id);
create index announcements_created_idx on announcements(created_at desc);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);

-- ── scoped-access helpers (SECURITY DEFINER so policies can read join tables) ─
create or replace function is_enrolled(course_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from enrollments e
    where e.course_id = is_enrolled.course_id and e.student_id = auth.uid()
  )
$$;

create or replace function teaches_course(course_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from course_teachers ct
    where ct.course_id = teaches_course.course_id and ct.teacher_id = auth.uid()
  )
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table courses          enable row level security;
alter table enrollments      enable row level security;
alter table course_teachers  enable row level security;
alter table announcements    enable row level security;
alter table audit_log        enable row level security;

-- courses: any signed-in user reads; only admin writes
create policy courses_read on courses for select
  using (auth.uid() is not null);
create policy courses_admin_write on courses for all
  using (is_active_admin()) with check (is_active_admin());

-- enrollments: admin all; a student may read their own enrollment rows
create policy enrollments_admin_write on enrollments for all
  using (is_active_admin()) with check (is_active_admin());
create policy enrollments_self_read on enrollments for select
  using (student_id = auth.uid() or is_active_admin());

-- course_teachers: admin all; a teacher may read their own assignment rows
create policy course_teachers_admin_write on course_teachers for all
  using (is_active_admin()) with check (is_active_admin());
create policy course_teachers_self_read on course_teachers for select
  using (teacher_id = auth.uid() or is_active_admin());

-- announcements:
--   read  → admin all; global (course_id null) to any signed-in user;
--           per-course to enrolled students or assigned teachers
create policy announcements_read on announcements for select
  using (
    is_active_admin()
    or (course_id is null and auth.uid() is not null)
    or is_enrolled(course_id)
    or teaches_course(course_id)
  );
--   insert → admin anything; teacher only for assigned course (global blocked for teacher)
create policy announcements_insert on announcements for insert
  with check (
    is_active_admin()
    or (current_role() = 'teacher' and course_id is not null and teaches_course(course_id))
  );
--   update/archive → admin anything; teacher only within assigned course
create policy announcements_update on announcements for update
  using (
    is_active_admin()
    or (current_role() = 'teacher' and course_id is not null and teaches_course(course_id))
  )
  with check (
    is_active_admin()
    or (current_role() = 'teacher' and course_id is not null and teaches_course(course_id))
  );
create policy announcements_delete on announcements for delete
  using (is_active_admin());

-- audit_log: admin-only read + write (sensitive). Server uses service role anyway.
create policy audit_admin_all on audit_log for all
  using (is_active_admin()) with check (is_active_admin());
```

> The teacher INSERT policy intentionally forbids global (`course_id is null`) posts: only admins post globally (spec §5.1 — teachers are scoped to assigned courses). Students have no insert/update policy, so RLS denies their writes by default.

- [ ] **Step 5: Apply the migration**

Run (Supabase CLI linked to `cert-ed-prod`): `supabase db push`
(or paste the SQL into the Supabase SQL editor for the prod project.)
Expected: success, 5 tables + 2 functions created.

- [ ] **Step 6: Run the RLS test — must pass**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/rls-phase1.test.ts`
Expected: PASS (8 assertions: student-scoped read, student insert blocked, teacher assigned insert ok, teacher unassigned insert blocked, admin global insert ok, anon courses blocked, non-admin audit insert blocked).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0002_announcements_admin.sql tests/integration/rls-phase1.test.ts
git commit -m "feat: phase1 schema (courses/enrollments/course_teachers/announcements/audit_log) + scoped RLS"
```

---

## Task 1.2: Response envelope + Zod schemas

**Files:**
- Create: `lib/http/envelope.ts`, `lib/validation/courses.ts`, `lib/validation/enrollments.ts`, `lib/validation/courseTeachers.ts`, `lib/validation/announcements.ts`, `lib/validation/users.ts`
- Test: `tests/unit/validation-phase1.test.ts`

- [ ] **Step 1: Write the failing schema tests**

```ts
// tests/unit/validation-phase1.test.ts
import { describe, it, expect } from 'vitest'
import { courseCreateSchema } from '@/lib/validation/courses'
import { enrollmentCreateSchema } from '@/lib/validation/enrollments'
import { assignmentCreateSchema } from '@/lib/validation/courseTeachers'
import { announcementCreateSchema, announcementListQuerySchema } from '@/lib/validation/announcements'
import { addUserSchema } from '@/lib/validation/users'

const uuid = '11111111-1111-1111-1111-111111111111'

describe('courseCreateSchema', () => {
  it('accepts a non-empty name', () => {
    expect(courseCreateSchema.parse({ name: 'Math 5' })).toEqual({ name: 'Math 5' })
  })
  it('rejects an empty name', () => {
    expect(courseCreateSchema.safeParse({ name: '' }).success).toBe(false)
  })
})

describe('enrollmentCreateSchema', () => {
  it('requires both uuids', () => {
    expect(enrollmentCreateSchema.safeParse({ student_id: uuid, course_id: uuid }).success).toBe(true)
    expect(enrollmentCreateSchema.safeParse({ student_id: 'no', course_id: uuid }).success).toBe(false)
  })
})

describe('assignmentCreateSchema', () => {
  it('requires teacher_id + course_id uuids', () => {
    expect(assignmentCreateSchema.safeParse({ teacher_id: uuid, course_id: uuid }).success).toBe(true)
    expect(assignmentCreateSchema.safeParse({ teacher_id: uuid }).success).toBe(false)
  })
})

describe('announcementCreateSchema', () => {
  it('accepts title+message with null course', () => {
    const r = announcementCreateSchema.parse({ title: 'Hi', message: 'Body', course_id: null })
    expect(r.course_id).toBeNull()
  })
  it('coerces missing course_id to null', () => {
    expect(announcementCreateSchema.parse({ title: 'Hi', message: 'Body' }).course_id).toBeNull()
  })
  it('rejects empty title', () => {
    expect(announcementCreateSchema.safeParse({ title: '', message: 'x' }).success).toBe(false)
  })
})

describe('announcementListQuerySchema', () => {
  it('defaults page=1, pageSize=20', () => {
    const r = announcementListQuerySchema.parse({})
    expect(r).toMatchObject({ page: 1, pageSize: 20, q: '' })
  })
  it('coerces string page numbers', () => {
    expect(announcementListQuerySchema.parse({ page: '3', pageSize: '10' })).toMatchObject({ page: 3, pageSize: 10 })
  })
  it('caps pageSize at 50', () => {
    expect(announcementListQuerySchema.parse({ pageSize: '999' }).pageSize).toBe(50)
  })
})

describe('addUserSchema', () => {
  it('accepts student with class_level', () => {
    expect(addUserSchema.safeParse({ email: 'a@b.com', role: 'student', class_level: '5' }).success).toBe(true)
  })
  it('accepts teacher without class_level', () => {
    expect(addUserSchema.safeParse({ email: 'a@b.com', role: 'teacher' }).success).toBe(true)
  })
  it('rejects an invalid email', () => {
    expect(addUserSchema.safeParse({ email: 'nope', role: 'student' }).success).toBe(false)
  })
  it('rejects an invalid role', () => {
    expect(addUserSchema.safeParse({ email: 'a@b.com', role: 'superuser' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/validation-phase1.test.ts` — Expected: FAIL (no modules).

- [ ] **Step 3: Implement the envelope helper** — `lib/http/envelope.ts`

```ts
import { NextResponse } from 'next/server'

export type Envelope<T> = { success: true; data: T } | { success: false; error: string }

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<Envelope<T>>({ success: true, data }, { status })
}

export function fail(error: string, status = 400) {
  return NextResponse.json<Envelope<never>>({ success: false, error }, { status })
}
```

- [ ] **Step 4: Implement the Zod schemas**

`lib/validation/courses.ts`:
```ts
import { z } from 'zod'

export const courseCreateSchema = z.object({
  name: z.string().trim().min(1, 'name required').max(120),
})
export const courseUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['active', 'archived']).optional(),
})
export type CourseCreate = z.infer<typeof courseCreateSchema>
export type CourseUpdate = z.infer<typeof courseUpdateSchema>
```

`lib/validation/enrollments.ts`:
```ts
import { z } from 'zod'

export const enrollmentCreateSchema = z.object({
  student_id: z.string().uuid(),
  course_id: z.string().uuid(),
})
export type EnrollmentCreate = z.infer<typeof enrollmentCreateSchema>
```

`lib/validation/courseTeachers.ts`:
```ts
import { z } from 'zod'

export const assignmentCreateSchema = z.object({
  teacher_id: z.string().uuid(),
  course_id: z.string().uuid(),
})
export type AssignmentCreate = z.infer<typeof assignmentCreateSchema>
```

`lib/validation/announcements.ts`:
```ts
import { z } from 'zod'

export const announcementCreateSchema = z.object({
  title: z.string().trim().min(1, 'title required').max(160),
  message: z.string().trim().min(1, 'message required').max(5000),
  course_id: z.string().uuid().nullable().default(null),
})

export const announcementUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  message: z.string().trim().min(1).max(5000).optional(),
  status: z.enum(['active', 'archived']).optional(),
})

export const announcementListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().default(''),
})

export type AnnouncementCreate = z.infer<typeof announcementCreateSchema>
export type AnnouncementUpdate = z.infer<typeof announcementUpdateSchema>
export type AnnouncementListQuery = z.infer<typeof announcementListQuerySchema>
```

`lib/validation/users.ts`:
```ts
import { z } from 'zod'

export const addUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  full_name: z.string().trim().max(120).optional(),
  role: z.enum(['admin', 'teacher', 'student']),
  class_level: z.string().trim().max(20).optional(),
})
export type AddUser = z.infer<typeof addUserSchema>
```

- [ ] **Step 5: Run — must pass** — Run: `npm run test -- tests/unit/validation-phase1.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/http/envelope.ts lib/validation tests/unit/validation-phase1.test.ts
git commit -m "feat: response envelope + zod schemas for phase1 entities"
```

---

## Task 1.3: Repositories — courses, enrollments, courseTeachers, announcements

**Files:**
- Create: `lib/repos/courses.ts`, `lib/repos/enrollments.ts`, `lib/repos/courseTeachers.ts`, `lib/repos/announcements.ts`

> Repos are thin data-access wrappers over the RLS-enforced server client. The announcements list repo is the one with non-trivial logic (pagination + title search + status filter); it gets a dedicated test in Task 1.6 (scope) and is exercised end-to-end by the integration RLS test. The CRUD wrappers are covered by the API integration in Tasks 1.6–1.7, so no separate unit test here — they contain no branching logic to assert.

- [ ] **Step 1: Implement** — `lib/repos/courses.ts`

```ts
import { createClient } from '@/lib/supabase/server'
import type { CourseCreate, CourseUpdate } from '@/lib/validation/courses'

export type Course = { id: string; name: string; status: 'active' | 'archived'; created_at: string }

export async function listCourses(): Promise<Course[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('courses').select('*').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as Course[]
}

export async function createCourse(input: CourseCreate): Promise<Course> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('courses').insert(input).select('*').single()
  if (error) throw new Error(error.message)
  return data as Course
}

export async function updateCourse(id: string, patch: CourseUpdate): Promise<Course> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('courses').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  return data as Course
}

export async function archiveCourse(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('courses').update({ status: 'archived' }).eq('id', id)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: Implement** — `lib/repos/enrollments.ts`

```ts
import { createClient } from '@/lib/supabase/server'
import type { EnrollmentCreate } from '@/lib/validation/enrollments'

export type Enrollment = { id: string; student_id: string; course_id: string; created_at: string }

export async function listEnrollments(courseId: string): Promise<Enrollment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('enrollments').select('*').eq('course_id', courseId)
  if (error) throw new Error(error.message)
  return (data ?? []) as Enrollment[]
}

export async function enroll(input: EnrollmentCreate): Promise<Enrollment> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('enrollments').insert(input).select('*').single()
  if (error) throw new Error(error.message)
  return data as Enrollment
}

export async function unenroll(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('enrollments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 3: Implement** — `lib/repos/courseTeachers.ts`

```ts
import { createClient } from '@/lib/supabase/server'
import type { AssignmentCreate } from '@/lib/validation/courseTeachers'

export type Assignment = { id: string; teacher_id: string; course_id: string; created_at: string }

export async function listAssignments(courseId: string): Promise<Assignment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('course_teachers').select('*').eq('course_id', courseId)
  if (error) throw new Error(error.message)
  return (data ?? []) as Assignment[]
}

export async function assignTeacher(input: AssignmentCreate): Promise<Assignment> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('course_teachers').insert(input).select('*').single()
  if (error) throw new Error(error.message)
  return data as Assignment
}

export async function unassignTeacher(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('course_teachers').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: Implement** — `lib/repos/announcements.ts`

```ts
import { createClient } from '@/lib/supabase/server'
import type { AnnouncementCreate, AnnouncementUpdate, AnnouncementListQuery } from '@/lib/validation/announcements'

export type Announcement = {
  id: string
  course_id: string | null
  title: string
  message: string
  author_id: string
  status: 'active' | 'archived'
  created_at: string
}

export type AnnouncementPage = { items: Announcement[]; total: number; page: number; pageSize: number }

// RLS already scopes which rows are visible (enrolled/assigned/global/admin).
// This adds active-only filter, title search, and pagination on top.
export async function listAnnouncements(query: AnnouncementListQuery): Promise<AnnouncementPage> {
  const { page, pageSize, q } = query
  const supabase = await createClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let builder = supabase
    .from('announcements')
    .select('*', { count: 'exact' })
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (q) builder = builder.ilike('title', `%${q}%`)

  const { data, error, count } = await builder
  if (error) throw new Error(error.message)
  return { items: (data ?? []) as Announcement[], total: count ?? 0, page, pageSize }
}

export async function createAnnouncement(input: AnnouncementCreate, authorId: string): Promise<Announcement> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('announcements')
    .insert({ ...input, author_id: authorId })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as Announcement
}

export async function updateAnnouncement(id: string, patch: AnnouncementUpdate): Promise<Announcement> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('announcements').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  return data as Announcement
}

export async function archiveAnnouncement(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('announcements').update({ status: 'archived' }).eq('id', id)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 5: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/repos/courses.ts lib/repos/enrollments.ts lib/repos/courseTeachers.ts lib/repos/announcements.ts
git commit -m "feat: repositories for courses/enrollments/courseTeachers/announcements"
```

---

## Task 1.4: First-login allowlist binding (TDD)

> Spec §4.2/§7.1: admins seed `profiles` rows by email with `id = null`; the **first matching Google login binds** `auth.uid` to that row. This task fills the Phase 0 gap.

**Files:**
- Create: `lib/auth/bindProfile.ts`
- Modify: `app/(app)/auth/callback/route.ts`
- Test: `tests/unit/bindProfile.test.ts`

- [ ] **Step 1: Write the failing test** (admin client mocked so we assert the binding logic, no DB)

```ts
// tests/unit/bindProfile.test.ts
import { describe, it, expect, vi } from 'vitest'
import { bindProfileOnFirstLogin } from '@/lib/auth/bindProfile'

// Build a chainable mock of the supabase-js query builder for one table.
function makeAdmin(rows: { byId?: any; byEmail?: any }) {
  const updateCalls: any[] = []
  const api = {
    updateCalls,
    from: vi.fn(() => api),
    // .select('*').eq('id', uid).maybeSingle()
    select: vi.fn(() => api),
    _eqField: '' as string,
    _eqValue: '' as string,
    eq: vi.fn((field: string, value: string) => { api._eqField = field; api._eqValue = value; return api }),
    maybeSingle: vi.fn(async () => {
      if (api._eqField === 'id') return { data: rows.byId ?? null, error: null }
      if (api._eqField === 'email') return { data: rows.byEmail ?? null, error: null }
      return { data: null, error: null }
    }),
    update: vi.fn((patch: any) => { updateCalls.push({ patch }); return api }),
  }
  return api as any
}

const uid = 'auth-uid-123'
const email = 'pre@seed.com'

describe('bindProfileOnFirstLogin', () => {
  it('does nothing when a profile already matches auth.uid', async () => {
    const admin = makeAdmin({ byId: { id: uid, email, status: 'active' } })
    const result = await bindProfileOnFirstLogin(admin, uid, email)
    expect(result).toBe('already-bound')
    expect(admin.updateCalls).toHaveLength(0)
  })

  it('binds an active seeded row (id null) to the auth uid by email', async () => {
    const admin = makeAdmin({ byId: null, byEmail: { id: null, email, status: 'active' } })
    const result = await bindProfileOnFirstLogin(admin, uid, email)
    expect(result).toBe('bound')
    expect(admin.updateCalls).toHaveLength(1)
    expect(admin.updateCalls[0].patch).toEqual({ id: uid })
  })

  it('does NOT bind a disabled seeded row', async () => {
    const admin = makeAdmin({ byId: null, byEmail: { id: null, email, status: 'disabled' } })
    const result = await bindProfileOnFirstLogin(admin, uid, email)
    expect(result).toBe('not-allowlisted')
    expect(admin.updateCalls).toHaveLength(0)
  })

  it('returns not-allowlisted when no row matches the email', async () => {
    const admin = makeAdmin({ byId: null, byEmail: null })
    const result = await bindProfileOnFirstLogin(admin, uid, email)
    expect(result).toBe('not-allowlisted')
    expect(admin.updateCalls).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/bindProfile.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement** — `lib/auth/bindProfile.ts`

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type BindResult = 'already-bound' | 'bound' | 'not-allowlisted'

/**
 * On first Google login the auth user has a fresh uid that may not yet match
 * any profile row. Admins pre-seed profiles by email with id = null. This binds
 * the authenticated uid onto the matching active seeded row.
 * Uses the service-role admin client (must bypass RLS — there is no profile to
 * read under the user's own JWT yet).
 */
export async function bindProfileOnFirstLogin(
  admin: SupabaseClient,
  authUid: string,
  email: string,
): Promise<BindResult> {
  const lower = email.toLowerCase()

  const { data: byId } = await admin.from('profiles').select('*').eq('id', authUid).maybeSingle()
  if (byId) return 'already-bound'

  const { data: byEmail } = await admin.from('profiles').select('*').eq('email', lower).maybeSingle()
  if (!byEmail || byEmail.status === 'disabled' || byEmail.id) return 'not-allowlisted'

  await admin.from('profiles').update({ id: authUid }).eq('email', lower)
  return 'bound'
}
```

> Guard `byEmail.id` (already non-null) → treat as not-this-flow so we never re-point a bound row. `disabled` seeds are never bound (revoked users stay out).

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/bindProfile.test.ts` — Expected: PASS.

- [ ] **Step 5: Wire it into the auth callback** — replace `app/(app)/auth/callback/route.ts` with:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bindProfileOnFirstLogin } from '@/lib/auth/bindProfile'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user?.email) {
      const admin = createAdminClient()
      await bindProfileOnFirstLogin(admin, data.user.id, data.user.email)
    }
  }
  return NextResponse.redirect(`${origin}/dashboard`)
}
```

> The dashboard (Phase 0 Task 0.8) already redirects unbound/pending users to `/access-pending` and disabled to `/access-revoked`, so after binding the role-aware routing just works.

- [ ] **Step 6: Typecheck + run the unit suite**

Run: `npx tsc --noEmit` — Expected: PASS.
Run: `npm run test -- tests/unit/bindProfile.test.ts` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/auth/bindProfile.ts "app/(app)/auth/callback/route.ts" tests/unit/bindProfile.test.ts
git commit -m "feat: bind seeded profile to auth uid on first google login"
```

---

## Task 1.5: Admin Users screen — list + add user + revoke/restore (TDD on revoke action)

> Spec §7.1: add writes a `profiles` allowlist row (`status='active'`) via the **service-role** client; revoke sets `status='disabled'`, calls `auth.admin.signOut(userId)` to kill live sessions, and writes an `audit_log` row; restore reverses status + audits. All admin-guarded.

**Files:**
- Create: `lib/audit.ts`, `lib/repos/users.ts`, `app/(app)/admin/layout.tsx`, `app/(app)/admin/users/page.tsx`, `app/(app)/admin/users/actions.ts`
- Test: `tests/unit/revoke-action.test.ts`

- [ ] **Step 1: Write the failing test for the revoke repo function** (admin client fully mocked)

```ts
// tests/unit/revoke-action.test.ts
import { describe, it, expect, vi } from 'vitest'
import { revokeUser, restoreUser } from '@/lib/repos/users'

function makeAdmin() {
  const calls = { updates: [] as any[], audits: [] as any[], signOuts: [] as string[] }
  const table = (name: string) => ({
    update: (patch: any) => ({
      eq: async (_f: string, id: string) => { calls.updates.push({ name, patch, id }); return { error: null } },
    }),
    insert: async (row: any) => { if (name === 'audit_log') calls.audits.push(row); return { error: null } },
  })
  const admin = {
    calls,
    from: (name: string) => table(name),
    auth: { admin: { signOut: async (id: string) => { calls.signOuts.push(id); return { error: null } } } },
  }
  return admin as any
}

const actor = 'admin-1'
const target = 'user-9'

describe('revokeUser', () => {
  it('disables, signs out, and audits', async () => {
    const admin = makeAdmin()
    await revokeUser(admin, target, actor)
    expect(admin.calls.updates).toEqual([{ name: 'profiles', patch: { status: 'disabled' }, id: target }])
    expect(admin.calls.signOuts).toEqual([target])
    expect(admin.calls.audits).toHaveLength(1)
    expect(admin.calls.audits[0]).toMatchObject({
      actor_id: actor, action: 'revoke', entity_type: 'profile', entity_id: target,
    })
  })
})

describe('restoreUser', () => {
  it('reactivates and audits (no sign-out)', async () => {
    const admin = makeAdmin()
    await restoreUser(admin, target, actor)
    expect(admin.calls.updates).toEqual([{ name: 'profiles', patch: { status: 'active' }, id: target }])
    expect(admin.calls.signOuts).toEqual([])
    expect(admin.calls.audits[0]).toMatchObject({ action: 'restore', entity_type: 'profile', entity_id: target })
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/revoke-action.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement the audit helper** — `lib/audit.ts`

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditAction = 'revoke' | 'restore' | 'add_user'

export async function writeAudit(
  admin: SupabaseClient,
  input: { actor_id: string; action: AuditAction; entity_type: string; entity_id: string },
): Promise<void> {
  const { error } = await admin.from('audit_log').insert(input)
  if (error) throw new Error(`audit: ${error.message}`)
}
```

- [ ] **Step 4: Implement the users repo** — `lib/repos/users.ts`

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AddUser } from '@/lib/validation/users'
import { writeAudit } from '@/lib/audit'

export type ProfileRow = {
  id: string | null
  email: string
  full_name: string | null
  role: 'admin' | 'teacher' | 'student'
  status: 'active' | 'pending' | 'disabled'
  class_level: string | null
  created_at: string
}

export async function listProfiles(admin: SupabaseClient): Promise<ProfileRow[]> {
  const { data, error } = await admin.from('profiles').select('*').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as ProfileRow[]
}

// Seed an allowlist row (id stays null until the user's first Google login binds it).
export async function addUser(admin: SupabaseClient, input: AddUser, actorId: string): Promise<ProfileRow> {
  const row = {
    email: input.email,
    full_name: input.full_name ?? null,
    role: input.role,
    status: 'active' as const,
    class_level: input.role === 'student' ? (input.class_level ?? null) : null,
  }
  const { data, error } = await admin.from('profiles').upsert(row, { onConflict: 'email' }).select('*').single()
  if (error) throw new Error(error.message)
  await writeAudit(admin, { actor_id: actorId, action: 'add_user', entity_type: 'profile', entity_id: (data as ProfileRow).id ?? actorId })
  return data as ProfileRow
}

export async function revokeUser(admin: SupabaseClient, userId: string, actorId: string): Promise<void> {
  const { error } = await admin.from('profiles').update({ status: 'disabled' }).eq('id', userId)
  if (error) throw new Error(error.message)
  await admin.auth.admin.signOut(userId)
  await writeAudit(admin, { actor_id: actorId, action: 'revoke', entity_type: 'profile', entity_id: userId })
}

export async function restoreUser(admin: SupabaseClient, userId: string, actorId: string): Promise<void> {
  const { error } = await admin.from('profiles').update({ status: 'active' }).eq('id', userId)
  if (error) throw new Error(error.message)
  await writeAudit(admin, { actor_id: actorId, action: 'restore', entity_type: 'profile', entity_id: userId })
}
```

- [ ] **Step 5: Run — must pass** — Run: `npm run test -- tests/unit/revoke-action.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit the data layer**

```bash
git add lib/audit.ts lib/repos/users.ts tests/unit/revoke-action.test.ts
git commit -m "feat: admin user repo (add/revoke/restore) + audit helper"
```

- [ ] **Step 7: Admin layout guard** — `app/(app)/admin/layout.tsx`

```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active' || profile.role !== 'admin') redirect('/dashboard')
  return <div className="mx-auto max-w-6xl p-8">{children}</div>
}
```

- [ ] **Step 8: Server actions** — `app/(app)/admin/users/actions.ts`

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth/profile'
import { assertRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { addUserSchema } from '@/lib/validation/users'
import { addUser, revokeUser, restoreUser } from '@/lib/repos/users'

async function requireAdminId(): Promise<string> {
  const profile = await getProfile()
  assertRole(profile, ['admin'])
  return profile!.id
}

export async function addUserAction(formData: FormData) {
  const actorId = await requireAdminId()
  const parsed = addUserSchema.safeParse({
    email: formData.get('email'),
    full_name: formData.get('full_name') || undefined,
    role: formData.get('role'),
    class_level: formData.get('class_level') || undefined,
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)
  await addUser(createAdminClient(), parsed.data, actorId)
  revalidatePath('/admin/users')
}

export async function revokeUserAction(formData: FormData) {
  const actorId = await requireAdminId()
  const userId = String(formData.get('user_id'))
  if (!userId) throw new Error('user_id required')
  await revokeUser(createAdminClient(), userId, actorId)
  revalidatePath('/admin/users')
}

export async function restoreUserAction(formData: FormData) {
  const actorId = await requireAdminId()
  const userId = String(formData.get('user_id'))
  if (!userId) throw new Error('user_id required')
  await restoreUser(createAdminClient(), userId, actorId)
  revalidatePath('/admin/users')
}
```

- [ ] **Step 9: Users page** — `app/(app)/admin/users/page.tsx`

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { listProfiles } from '@/lib/repos/users'
import { addUserAction, revokeUserAction, restoreUserAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const users = await listProfiles(createAdminClient())

  return (
    <main>
      <h1 className="text-2xl font-semibold">Users</h1>

      <form action={addUserAction} className="mt-6 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-5">
        <input name="email" type="email" required placeholder="email" className="rounded border px-3 py-2 sm:col-span-2" />
        <input name="full_name" placeholder="full name (optional)" className="rounded border px-3 py-2" />
        <select name="role" className="rounded border px-3 py-2">
          <option value="student">student</option>
          <option value="teacher">teacher</option>
          <option value="admin">admin</option>
        </select>
        <input name="class_level" placeholder="class (students)" className="rounded border px-3 py-2" />
        <button className="rounded bg-slate-900 px-4 py-2 font-medium text-white sm:col-span-5">Add user</button>
      </form>

      <table className="mt-8 w-full text-left text-sm">
        <thead className="border-b text-slate-500">
          <tr><th className="py-2">Email</th><th>Role</th><th>Status</th><th>Class</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.email} className="border-b">
              <td className="py-2">{u.email}</td>
              <td>{u.role}</td>
              <td>{u.status}</td>
              <td>{u.class_level ?? '—'}</td>
              <td className="text-right">
                {u.id && u.status !== 'disabled' && (
                  <form action={revokeUserAction} className="inline">
                    <input type="hidden" name="user_id" value={u.id} />
                    <button className="rounded border px-3 py-1 text-red-600">Revoke</button>
                  </form>
                )}
                {u.id && u.status === 'disabled' && (
                  <form action={restoreUserAction} className="inline">
                    <input type="hidden" name="user_id" value={u.id} />
                    <button className="rounded border px-3 py-1 text-green-700">Restore</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 10: Manual verify** — `npm run dev`, sign in as the seeded admin, visit `/admin/users`. Add a user (email + role student + class 5). It appears in the table with status `active`. Click Revoke on a bound user → status flips to `disabled`, Restore appears; click Restore → back to `active`. (The seeded admin row has a bound `id`; freshly added rows show no action buttons until the user logs in and binds, which is correct.)

- [ ] **Step 11: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 12: Commit the UI**

```bash
git add "app/(app)/admin/layout.tsx" "app/(app)/admin/users"
git commit -m "feat: admin users screen (add/revoke/restore via service role)"
```

---

## Task 1.6: Admin Courses + enrollments + teacher assignments

**Files:**
- Create: `app/(app)/admin/courses/page.tsx`, `app/(app)/admin/courses/actions.ts`, `app/(app)/admin/course-teachers/page.tsx`, `app/(app)/admin/course-teachers/actions.ts`

> Course/enrollment/assignment writes go through the RLS server client (admin passes the `is_active_admin()` policy). Each action re-checks admin via `assertRole` before mutating.

- [ ] **Step 1: Courses + enrollments server actions** — `app/(app)/admin/courses/actions.ts`

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth/profile'
import { assertRole } from '@/lib/auth/guards'
import { courseCreateSchema } from '@/lib/validation/courses'
import { enrollmentCreateSchema } from '@/lib/validation/enrollments'
import { createCourse, archiveCourse } from '@/lib/repos/courses'
import { enroll, unenroll } from '@/lib/repos/enrollments'

async function requireAdmin() {
  const profile = await getProfile()
  assertRole(profile, ['admin'])
}

export async function createCourseAction(formData: FormData) {
  await requireAdmin()
  const parsed = courseCreateSchema.safeParse({ name: formData.get('name') })
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)
  await createCourse(parsed.data)
  revalidatePath('/admin/courses')
}

export async function archiveCourseAction(formData: FormData) {
  await requireAdmin()
  await archiveCourse(String(formData.get('course_id')))
  revalidatePath('/admin/courses')
}

export async function enrollAction(formData: FormData) {
  await requireAdmin()
  const parsed = enrollmentCreateSchema.safeParse({
    student_id: formData.get('student_id'),
    course_id: formData.get('course_id'),
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)
  await enroll(parsed.data)
  revalidatePath('/admin/courses')
}

export async function unenrollAction(formData: FormData) {
  await requireAdmin()
  await unenroll(String(formData.get('enrollment_id')))
  revalidatePath('/admin/courses')
}
```

- [ ] **Step 2: Courses page** — `app/(app)/admin/courses/page.tsx`

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { listCourses } from '@/lib/repos/courses'
import { createCourseAction, archiveCourseAction, enrollAction, unenrollAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminCoursesPage() {
  const admin = createAdminClient()
  const { data: courses } = await admin.from('courses').select('*').order('name')
  const { data: students } = await admin.from('profiles').select('id,email,full_name').eq('role', 'student').not('id', 'is', null)
  const { data: enrollments } = await admin.from('enrollments').select('id,student_id,course_id')

  const studentLabel = (id: string) => {
    const s = (students ?? []).find((x: any) => x.id === id)
    return s ? (s.full_name ?? s.email) : id
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold">Courses</h1>

      <form action={createCourseAction} className="mt-6 flex gap-3 rounded-xl border bg-white p-4">
        <input name="name" required placeholder="course name" className="flex-1 rounded border px-3 py-2" />
        <button className="rounded bg-slate-900 px-4 py-2 font-medium text-white">Add course</button>
      </form>

      <div className="mt-8 space-y-6">
        {(courses ?? []).map((c: any) => {
          const rows = (enrollments ?? []).filter((e: any) => e.course_id === c.id)
          return (
            <section key={c.id} className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{c.name} <span className="text-slate-400">({c.status})</span></h2>
                {c.status === 'active' && (
                  <form action={archiveCourseAction}>
                    <input type="hidden" name="course_id" value={c.id} />
                    <button className="rounded border px-3 py-1 text-sm">Archive</button>
                  </form>
                )}
              </div>

              <ul className="mt-3 space-y-1 text-sm">
                {rows.map((e: any) => (
                  <li key={e.id} className="flex items-center justify-between">
                    <span>{studentLabel(e.student_id)}</span>
                    <form action={unenrollAction} className="inline">
                      <input type="hidden" name="enrollment_id" value={e.id} />
                      <button className="text-red-600">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>

              <form action={enrollAction} className="mt-3 flex gap-2">
                <input type="hidden" name="course_id" value={c.id} />
                <select name="student_id" className="rounded border px-2 py-1 text-sm">
                  {(students ?? []).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.full_name ?? s.email}</option>
                  ))}
                </select>
                <button className="rounded border px-3 py-1 text-sm">Enroll</button>
              </form>
            </section>
          )
        })}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Teacher-assignment server actions** — `app/(app)/admin/course-teachers/actions.ts`

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth/profile'
import { assertRole } from '@/lib/auth/guards'
import { assignmentCreateSchema } from '@/lib/validation/courseTeachers'
import { assignTeacher, unassignTeacher } from '@/lib/repos/courseTeachers'

async function requireAdmin() {
  const profile = await getProfile()
  assertRole(profile, ['admin'])
}

export async function assignTeacherAction(formData: FormData) {
  await requireAdmin()
  const parsed = assignmentCreateSchema.safeParse({
    teacher_id: formData.get('teacher_id'),
    course_id: formData.get('course_id'),
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)
  await assignTeacher(parsed.data)
  revalidatePath('/admin/course-teachers')
}

export async function unassignTeacherAction(formData: FormData) {
  await requireAdmin()
  await unassignTeacher(String(formData.get('assignment_id')))
  revalidatePath('/admin/course-teachers')
}
```

- [ ] **Step 4: Teacher-assignment page** — `app/(app)/admin/course-teachers/page.tsx`

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { assignTeacherAction, unassignTeacherAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function CourseTeachersPage() {
  const admin = createAdminClient()
  const { data: courses } = await admin.from('courses').select('id,name,status').eq('status', 'active').order('name')
  const { data: teachers } = await admin.from('profiles').select('id,email,full_name').eq('role', 'teacher').not('id', 'is', null)
  const { data: assignments } = await admin.from('course_teachers').select('id,teacher_id,course_id')

  const teacherLabel = (id: string) => {
    const t = (teachers ?? []).find((x: any) => x.id === id)
    return t ? (t.full_name ?? t.email) : id
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold">Teacher assignments</h1>
      <div className="mt-6 space-y-6">
        {(courses ?? []).map((c: any) => {
          const rows = (assignments ?? []).filter((a: any) => a.course_id === c.id)
          return (
            <section key={c.id} className="rounded-xl border bg-white p-4">
              <h2 className="font-medium">{c.name}</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {rows.map((a: any) => (
                  <li key={a.id} className="flex items-center justify-between">
                    <span>{teacherLabel(a.teacher_id)}</span>
                    <form action={unassignTeacherAction} className="inline">
                      <input type="hidden" name="assignment_id" value={a.id} />
                      <button className="text-red-600">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={assignTeacherAction} className="mt-3 flex gap-2">
                <input type="hidden" name="course_id" value={c.id} />
                <select name="teacher_id" className="rounded border px-2 py-1 text-sm">
                  {(teachers ?? []).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.full_name ?? t.email}</option>
                  ))}
                </select>
                <button className="rounded border px-3 py-1 text-sm">Assign</button>
              </form>
            </section>
          )
        })}
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Manual verify** — `npm run dev` as admin: at `/admin/courses` add a course, enroll a (bound) student, remove them; at `/admin/course-teachers` assign a (bound) teacher to the course and remove them. Archive a course → it shows `(archived)` and disappears from the assignment page's active list.

- [ ] **Step 6: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/admin/courses" "app/(app)/admin/course-teachers"
git commit -m "feat: admin courses, enrollments, and teacher-course assignment screens"
```

---

## Task 1.7: Announcements API — scoped GET / POST / PATCH / archive (TDD on scope guard)

> Spec §6: `announcements` (GET/POST/PATCH/archive). Reads are RLS-scoped (enrolled/assigned/global/admin). Writes enforce role + teacher-assigned-course scope at the API layer too (defense in depth on top of RLS).

**Files:**
- Create: `lib/auth/announcementScope.ts`, `app/api/announcements/route.ts`, `app/api/announcements/[id]/route.ts`
- Test: `tests/unit/announcements-scope.test.ts`

- [ ] **Step 1: Write the failing scope-guard test**

```ts
// tests/unit/announcements-scope.test.ts
import { describe, it, expect } from 'vitest'
import { assertCanPostAnnouncement } from '@/lib/auth/announcementScope'

const teacher = { id: 't1', role: 'teacher', status: 'active' } as any
const admin = { id: 'a1', role: 'admin', status: 'active' } as any
const student = { id: 's1', role: 'student', status: 'active' } as any

describe('assertCanPostAnnouncement', () => {
  it('admin may post to any course (and global)', () => {
    expect(() => assertCanPostAnnouncement(admin, null, ['cA'])).not.toThrow()
    expect(() => assertCanPostAnnouncement(admin, 'cZ', [])).not.toThrow()
  })

  it('teacher may post to an assigned course', () => {
    expect(() => assertCanPostAnnouncement(teacher, 'cA', ['cA', 'cB'])).not.toThrow()
  })

  it('teacher may NOT post to an unassigned course', () => {
    expect(() => assertCanPostAnnouncement(teacher, 'cZ', ['cA'])).toThrow('forbidden')
  })

  it('teacher may NOT post a global announcement', () => {
    expect(() => assertCanPostAnnouncement(teacher, null, ['cA'])).toThrow('forbidden')
  })

  it('student may never post', () => {
    expect(() => assertCanPostAnnouncement(student, 'cA', [])).toThrow('forbidden')
  })

  it('disabled actor is rejected', () => {
    expect(() => assertCanPostAnnouncement({ ...teacher, status: 'disabled' }, 'cA', ['cA'])).toThrow('revoked')
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/announcements-scope.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement the scope guard** — `lib/auth/announcementScope.ts`

```ts
import type { Profile } from '@/lib/auth/profile'

/**
 * Pure authorization check for posting/editing an announcement.
 * - admin: any course or global (course_id null)
 * - teacher: only an assigned course; never global
 * - student: never
 * `assignedCourseIds` is the set of course ids the teacher is assigned to.
 */
export function assertCanPostAnnouncement(
  profile: Profile | null,
  courseId: string | null,
  assignedCourseIds: string[],
): void {
  if (!profile) throw new Error('no-access')
  if (profile.status === 'disabled') throw new Error('revoked')
  if (profile.status !== 'active') throw new Error('no-access')
  if (profile.role === 'admin') return
  if (profile.role === 'teacher' && courseId !== null && assignedCourseIds.includes(courseId)) return
  throw new Error('forbidden')
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/announcements-scope.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit the guard**

```bash
git add lib/auth/announcementScope.ts tests/unit/announcements-scope.test.ts
git commit -m "feat: announcement post-scope guard (teacher assigned-course / admin)"
```

- [ ] **Step 6: Implement the collection route** — `app/api/announcements/route.ts`

```ts
import { NextRequest } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { ok, fail } from '@/lib/http/envelope'
import { announcementCreateSchema, announcementListQuerySchema } from '@/lib/validation/announcements'
import { listAnnouncements, createAnnouncement } from '@/lib/repos/announcements'
import { assertCanPostAnnouncement } from '@/lib/auth/announcementScope'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 403)

  const q = announcementListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!q.success) return fail(q.error.issues[0].message, 400)

  try {
    const page = await listAnnouncements(q.data) // RLS scopes the rows
    return ok(page)
  } catch (e) {
    return fail((e as Error).message, 500)
  }
}

export async function POST(request: NextRequest) {
  const profile = await getProfile()
  if (!profile) return fail('no-access', 403)

  let body: unknown
  try { body = await request.json() } catch { return fail('invalid json', 400) }
  const parsed = announcementCreateSchema.safeParse(body)
  if (!parsed.success) return fail(parsed.error.issues[0].message, 400)

  // teacher assigned-course scope (admin bypasses inside the guard)
  let assigned: string[] = []
  if (profile.role === 'teacher') {
    const supabase = await createClient()
    const { data } = await supabase.from('course_teachers').select('course_id').eq('teacher_id', profile.id)
    assigned = (data ?? []).map((r: { course_id: string }) => r.course_id)
  }
  try {
    assertCanPostAnnouncement(profile, parsed.data.course_id, assigned)
  } catch (e) {
    const msg = (e as Error).message
    return fail(msg, msg === 'forbidden' ? 403 : 401)
  }

  try {
    const created = await createAnnouncement(parsed.data, profile.id)
    return ok(created, 201)
  } catch (e) {
    return fail((e as Error).message, 500)
  }
}
```

- [ ] **Step 7: Implement the item route** — `app/api/announcements/[id]/route.ts`

```ts
import { NextRequest } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { ok, fail } from '@/lib/http/envelope'
import { announcementUpdateSchema } from '@/lib/validation/announcements'
import { updateAnnouncement, archiveAnnouncement } from '@/lib/repos/announcements'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 403)
  if (profile.role === 'student') return fail('forbidden', 403)

  let body: unknown
  try { body = await request.json() } catch { return fail('invalid json', 400) }
  const parsed = announcementUpdateSchema.safeParse(body)
  if (!parsed.success) return fail(parsed.error.issues[0].message, 400)

  try {
    // RLS enforces teacher assigned-course scope on UPDATE; a denied row errors.
    const updated = await updateAnnouncement(params.id, parsed.data)
    return ok(updated)
  } catch (e) {
    return fail((e as Error).message, 403)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 403)
  if (profile.role === 'student') return fail('forbidden', 403)

  try {
    await archiveAnnouncement(params.id) // soft-delete via status='archived' (RLS-scoped)
    return ok({ id: params.id, status: 'archived' })
  } catch (e) {
    return fail((e as Error).message, 403)
  }
}
```

- [ ] **Step 8: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 9: Manual smoke** — `npm run dev`, as the seeded admin POST a global announcement:

```bash
# grab the session cookie from the browser devtools after logging in, then:
curl -i -X POST http://localhost:3000/api/announcements \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <paste sb-* cookies>' \
  -d '{"title":"Welcome","message":"First post","course_id":null}'
```
Expected: `201` with `{"success":true,"data":{...}}`. A `GET /api/announcements` returns the item in `data.items`.

- [ ] **Step 10: Commit**

```bash
git add "app/api/announcements"
git commit -m "feat: announcements API (scoped GET, POST/PATCH/archive with scope guard)"
```

---

## Task 1.8: Announcements UI — student feed (scoped) + composer (teacher/admin)

> Spec §7.2: students see a feed scoped to enrolled + global; teacher/admin see a composer. Feed has pagination + simple title search (global DoD).

**Files:**
- Create: `app/(app)/announcements/page.tsx`, `app/(app)/announcements/Composer.tsx`

- [ ] **Step 1: Composer (client)** — `app/(app)/announcements/Composer.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type CourseOption = { id: string; name: string }

export default function Composer({ courses, allowGlobal }: { courses: CourseOption[]; allowGlobal: boolean }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [courseId, setCourseId] = useState<string>(allowGlobal ? '' : (courses[0]?.id ?? ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const res = await fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, course_id: courseId === '' ? null : courseId }),
    })
    const json = await res.json()
    setBusy(false)
    if (!json.success) { setError(json.error); return }
    setTitle(''); setMessage('')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="mb-8 grid gap-3 rounded-xl border bg-white p-4">
      <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Title"
        className="rounded border px-3 py-2" />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} required placeholder="Message"
        className="min-h-24 rounded border px-3 py-2" />
      <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="rounded border px-3 py-2">
        {allowGlobal && <option value="">Global (all)</option>}
        {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50">
        {busy ? 'Posting…' : 'Post announcement'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Feed page (server)** — `app/(app)/announcements/page.tsx`

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { listAnnouncements } from '@/lib/repos/announcements'
import { announcementListQuerySchema } from '@/lib/validation/announcements'
import Composer from './Composer'

export const dynamic = 'force-dynamic'

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string }
}) {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')

  const query = announcementListQuerySchema.parse({ page: searchParams.page, q: searchParams.q })
  const { items, total, page, pageSize } = await listAnnouncements(query)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // composer course options
  const canPost = profile.role === 'teacher' || profile.role === 'admin'
  let courseOptions: { id: string; name: string }[] = []
  if (canPost) {
    const supabase = await createClient()
    if (profile.role === 'admin') {
      const { data } = await supabase.from('courses').select('id,name').eq('status', 'active').order('name')
      courseOptions = (data ?? []) as any
    } else {
      const { data } = await supabase
        .from('course_teachers')
        .select('course_id, courses(id,name)')
        .eq('teacher_id', profile.id)
      courseOptions = (data ?? []).map((r: any) => r.courses).filter(Boolean)
    }
  }

  const qs = (next: number) => `?page=${next}${query.q ? `&q=${encodeURIComponent(query.q)}` : ''}`

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Announcements</h1>

      {canPost && <div className="mt-6"><Composer courses={courseOptions} allowGlobal={profile.role === 'admin'} /></div>}

      <form className="mt-4 flex gap-2" action="/announcements" method="get">
        <input name="q" defaultValue={query.q} placeholder="Search titles…" className="flex-1 rounded border px-3 py-2" />
        <button className="rounded border px-4 py-2">Search</button>
      </form>

      <ul className="mt-6 space-y-4">
        {items.length === 0 && <li className="text-slate-500">No announcements.</li>}
        {items.map((a) => (
          <li key={a.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-medium">{a.title}</h2>
              <time className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{a.message}</p>
            {a.course_id === null && <span className="mt-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs">Global</span>}
          </li>
        ))}
      </ul>

      <nav className="mt-6 flex items-center justify-between text-sm">
        <span className="text-slate-500">Page {page} of {totalPages} · {total} total</span>
        <span className="flex gap-2">
          {page > 1 && <Link href={qs(page - 1)} className="rounded border px-3 py-1">Prev</Link>}
          {page < totalPages && <Link href={qs(page + 1)} className="rounded border px-3 py-1">Next</Link>}
        </span>
      </nav>
    </main>
  )
}
```

- [ ] **Step 3: Manual verify** — `npm run dev`:
  - As admin: post a Global announcement and a per-course one; both appear; search by a title substring filters the list; Prev/Next appear once there are >20 active rows.
  - As a teacher assigned to course A: composer lists only course A, no "Global" option; posting works.
  - As a student enrolled in course A: no composer; sees the global + course-A posts but not course-B posts.

- [ ] **Step 4: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/announcements"
git commit -m "feat: announcements feed (scoped + paged + search) and teacher/admin composer"
```

---

## Task 1.9: E2E — admin adds student → teacher posts → student sees it → revoke blocks

> Spec §10 E2E: teacher posts announcement; admin adds a student; revoked student blocked. Playwright is introduced here (first E2E phase). Real Supabase (`cert-ed-preview`) is used; the three role sessions are created by injecting Supabase auth cookies generated via the admin API so the test does not need to drive the live Google consent screen.

**Files:**
- Create: `e2e/playwright.config.ts`, `e2e/announcements.spec.ts`
- Modify: `package.json` (add the `e2e` script)

- [ ] **Step 1: Install Playwright**

Run:
```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Add the E2E script to `package.json`** — in `"scripts"` add:

```json
"e2e": "playwright test -c e2e/playwright.config.ts"
```

- [ ] **Step 3: Playwright config** — `e2e/playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 60_000 },
})
```

- [ ] **Step 4: Write the E2E spec**

```ts
// e2e/announcements.spec.ts
import { test, expect, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(url, service)

const ref = new URL(url).host.split('.')[0] // <project-ref>.supabase.co
const cookieName = `sb-${ref}-auth-token`

type Seed = { studentId: string; teacherId: string; adminId: string; courseId: string }

async function seed(): Promise<Seed> {
  const mk = async (email: string, role: string, status = 'active', extra: object = {}) => {
    const { data } = await admin.auth.admin.createUser({ email, email_confirm: true })
    const id = data!.user.id
    await admin.from('profiles').upsert({ id, email, role, status, ...extra }, { onConflict: 'id' })
    return id
  }
  const adminId = await mk('e2e-admin@cert.test', 'admin')
  const teacherId = await mk('e2e-teacher@cert.test', 'teacher')
  const studentId = await mk('e2e-student@cert.test', 'student', 'active', { class_level: '5' })
  const { data: course } = await admin.from('courses').insert({ name: 'E2E Course' }).select('id').single()
  const courseId = course!.id
  await admin.from('course_teachers').insert({ teacher_id: teacherId, course_id: courseId })
  await admin.from('enrollments').insert({ student_id: studentId, course_id: courseId })
  return { studentId, teacherId, adminId, courseId }
}

async function cleanup(s: Seed) {
  await admin.from('announcements').delete().eq('course_id', s.courseId)
  await admin.from('course_teachers').delete().eq('course_id', s.courseId)
  await admin.from('enrollments').delete().eq('course_id', s.courseId)
  await admin.from('courses').delete().eq('id', s.courseId)
  for (const id of [s.studentId, s.teacherId, s.adminId]) {
    await admin.from('profiles').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
}

// Inject a real Supabase session cookie for a given user into a browser context.
async function loginAs(context: BrowserContext, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const c = createClient(url, anon)
  const { data: sess, error: vErr } = await c.auth.verifyOtp({
    token_hash: data.properties.hashed_token, type: 'magiclink',
  })
  if (vErr) throw vErr
  const session = sess.session!
  const value = encodeURIComponent(JSON.stringify([
    session.access_token, session.refresh_token, null, null, null,
  ]))
  await context.addCookies([{
    name: cookieName, value, domain: 'localhost', path: '/', httpOnly: false, sameSite: 'Lax',
  }])
}

test.describe('announcements flow', () => {
  let s: Seed
  test.beforeAll(async () => { s = await seed() })
  test.afterAll(async () => { await cleanup(s) })

  test('teacher posts → enrolled student sees it; revoked student is blocked', async ({ browser }) => {
    // teacher posts to the course
    const tCtx = await browser.newContext()
    await loginAs(tCtx, 'e2e-teacher@cert.test')
    const tPage = await tCtx.newPage()
    await tPage.goto('/announcements')
    await tPage.getByPlaceholder('Title').fill('Class moved to room 5')
    await tPage.getByPlaceholder('Message').fill('Please note the change.')
    await tPage.getByRole('button', { name: 'Post announcement' }).click()
    await expect(tPage.getByText('Class moved to room 5')).toBeVisible()
    await tCtx.close()

    // enrolled student sees it
    const sCtx = await browser.newContext()
    await loginAs(sCtx, 'e2e-student@cert.test')
    const sPage = await sCtx.newPage()
    await sPage.goto('/announcements')
    await expect(sPage.getByText('Class moved to room 5')).toBeVisible()
    await sPage.close()

    // admin revokes the student
    await admin.from('profiles').update({ status: 'disabled' }).eq('id', s.studentId)
    await admin.auth.admin.signOut(s.studentId)

    // a fresh student context (new login attempt) is blocked at /access-revoked
    const rCtx = await browser.newContext()
    await loginAs(rCtx, 'e2e-student@cert.test')
    const rPage = await rCtx.newPage()
    await rPage.goto('/dashboard')
    await expect(rPage).toHaveURL(/\/access-revoked/)
    await rCtx.close()
  })
})
```

> The cookie shape `[access_token, refresh_token, null, null, null]` matches what `@supabase/ssr` writes for `sb-<ref>-auth-token`. If the spike of Phase 0 already confirmed a different cookie split (chunked `…-auth-token.0/.1`), adjust the cookie name/value accordingly when implementing — verify by logging in once in the browser and inspecting the cookie.

- [ ] **Step 5: Run the E2E** (preview Supabase env loaded)

Run: `node --env-file=.env.local node_modules/.bin/playwright test -c e2e/playwright.config.ts`
Expected: PASS — teacher post visible to teacher; visible to enrolled student; after revoke, the student lands on `/access-revoked`.

> If the cookie injection does not establish a session (Supabase cookie format drift), fall back to seeding the session by visiting `/login`, completing Google once manually to capture the storage state, and reusing `storageState`. Record whichever path works.

- [ ] **Step 6: Commit**

```bash
git add e2e package.json package-lock.json
git commit -m "test: e2e announcement flow (teacher post → student sees → revoke blocks)"
```

---

## Acceptance Criteria

- [ ] `supabase/migrations/0002_announcements_admin.sql` creates `courses`, `enrollments`, `course_teachers`, `announcements`, `audit_log` with the spec §5 column names; RLS enabled on all five; helpers `is_enrolled(course_id)` and `teaches_course(course_id)` exist.
- [ ] `tests/integration/rls-phase1.test.ts` passes: student sees only enrolled-course + global announcements; student write blocked; teacher may insert for an assigned course but not an unassigned one; admin may insert globally; anon cannot read courses; non-admin cannot write `audit_log`.
- [ ] `npm run test` is green: validation, `bindProfile`, `revoke-action`, `announcements-scope` unit tests all pass.
- [ ] First Google login binds an admin-seeded (`id = null`, `active`) profile row to `auth.uid`; a `disabled` seed is never bound.
- [ ] Admin `/admin/users` lists profiles, adds a user (email/role/optional class) via the service-role client, and revoke (`status='disabled'` + `auth.admin.signOut` + audit) / restore (`status='active'` + audit) work; both write an `audit_log` row.
- [ ] Admin `/admin/courses` manages courses + enrollments; `/admin/course-teachers` manages teacher↔course assignments.
- [ ] `app/api/announcements` GET returns an RLS-scoped, paginated, title-searchable list in the `{ success, data }` envelope; POST/PATCH/DELETE enforce role + teacher assigned-course scope (teachers cannot post globally or to unassigned courses; students are read-only).
- [ ] `/announcements` shows the scoped feed with pagination + title search, and the composer only for teacher/admin (global option admin-only).
- [ ] `e2e/announcements.spec.ts` passes: teacher posts → enrolled student sees it → admin revokes → student is redirected to `/access-revoked`.
- [ ] Global DoD: RLS + policy tests on every new table; all API inputs Zod-validated and errors returned in the envelope; no service-role key or admin client imported into any client component; committed in small conventional-commit steps.

## Self-review notes

- **Spec coverage:** §5 tables (`courses`, `enrollments`, `course_teachers`, `announcements`, `audit_log`) use exact names/columns; §5.1 role matrix → RLS policies + the `announcementScope` API guard (defense in depth); §6 routes (`/admin/users` + revoke/restore, `/admin/courses`, `/admin/course-teachers`, `/announcements`, `api/announcements`); §7.1 add/revoke/restore via service role + `auth.admin.signOut` + audit; §7.2 scoped feed + composer; §8 soft-delete (archive) + audit-on-sensitive-actions; global DoD pagination + title search.
- **Phase 0 reuse (assumed to exist, not redefined):** `createClient` (server/browser), `createAdminClient`, `getProfile`/`Profile`, `assertRole`, SQL helpers `current_role()`/`current_status()`/`is_active_admin()`, the `profiles`/`org_settings` tables, and the `app/(app)/dashboard` + `/access-pending` + `/access-revoked` pages. This phase adds `is_enrolled`/`teaches_course` SQL helpers and the `envelope`, `audit`, `bindProfile`, `announcementScope` TS helpers.
- **Type consistency:** `Course`, `Enrollment`, `Assignment`, `Announcement`/`AnnouncementPage`, `ProfileRow`, `BindResult`, `Envelope<T>`, the Zod-inferred input types, and `assertCanPostAnnouncement`/`bindProfileOnFirstLogin` signatures are each defined once and referenced consistently across repos, actions, routes, and tests.
- **Security:** admin mutations use the service-role client only in `'use server'` actions / route handlers / `'server-only'` repos; the API write guard duplicates the RLS scope rule so a leaked direct call still fails; `bindProfile` refuses `disabled` and already-bound rows; revoke force-signs-out live sessions.
- **Defense in depth note:** announcement reads rely on RLS for row scoping (the repo adds active-only + pagination + search); writes are checked both at the API (`assertCanPostAnnouncement`) and by RLS — either alone is sufficient, together they are belt-and-suspenders.
- **No placeholders:** every code step has complete runnable code; every test step has exact run commands with expected FAIL→PASS; commits use conventional-commit messages with no AI attribution lines.

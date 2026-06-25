# Phase 5 — Calendar & Timetable Implementation Plan

> **How to build this (no special model, plugin, or skill required).** This plan is fully self-contained. Build the tasks **in order**, top to bottom. For each task, follow the steps verbatim: write the test exactly as shown → run the exact command and confirm the expected FAIL → paste the implementation exactly as shown → re-run and confirm PASS → commit. Then check off each `- [ ]`. Do not reorder steps, skip the test-first order, or improvise — every command and code block is provided literally.

**Goal:** A teacher/admin can define the recurring weekly `timetable_slots` and one-off `calendar_events` for their courses; an enrolled student opens `/calendar` and sees, in a FullCalendar month⇄week view, every occurrence of the timetable slots for their enrolled (and global) courses merged with calendar events and assignment `due_date`s — all rendered in the **viewer's own device timezone** with a TZ label, while recurring slot times stay anchored to the institute timezone (`org_settings.timezone`) and are expanded to absolute UTC instants before display.

**Architecture:** One Next.js 14 app; Supabase (Auth + Postgres + RLS) is the security boundary — reads are scoped to enrolled students / teachers-of-course / admin via the Phase 1 SQL helpers `is_enrolled(course_id)` and `teaches_course(course_id)` (and the TS mirrors `isEnrolled`/`teachesCourse` from Phase 3's `lib/auth/courseScope.ts`); Next.js Route Handlers (`app/api/*`) hold the trusted merge logic. Recurring slots carry a wall-clock `start_time`/`end_time` + `day_of_week` **anchored to `org_settings.timezone`**; a pure `expandSlots()` function expands them across a requested range into absolute UTC instants (so "when" is decided once, server-side, independent of any viewer). Absolute instants (slot occurrences, event datetimes, assignment due dates) are then formatted **in each viewer's device timezone** for display via the existing `lib/time/format.ts` `formatInstant` helper (Phase 3), and FullCalendar renders them with an explicit `timeZone`.

**Tech Stack:** Next.js 14, TypeScript (strict), Tailwind 4, `@supabase/supabase-js`, `@supabase/ssr`, Zod, Vitest, Playwright, FullCalendar (`@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`).

**Prereqted spec:** `docs/superpowers/specs/2026-06-25-cert-ed-academia-app-design.md` (§5 `timetable_slots`/`calendar_events`, §5.1 RLS table, §7.6 calendar feature, §8 timezone — store UTC, display in DEVICE timezone; recurring slots wall-clock-anchored to `org_settings.timezone` then converted to absolute instants)

**Depends on:** Phase 1 (Admin: courses/enrollments/course-teachers + the `is_enrolled`/`teaches_course` SQL helpers) — green. Phase 3 (Assignments) — green, for the assignment `due_date` deadline overlay and the reused `lib/time/format.ts` (`formatInstant`/`formatInstantDevice`). This phase reuses, and assumes the following already exist with these signatures:

```ts
// lib/auth/profile.ts (Phase 0) — getProfile(): Promise<Profile | null>; Profile = { id, email, full_name, role, status, class_level }
// lib/auth/guards.ts (Phase 0) — assertRole(profile, allowed[]): Profile
// lib/auth/courseScope.ts (Phase 3) — teachesCourse(courseId): Promise<boolean>; isEnrolled(courseId): Promise<boolean>
// lib/supabase/server.ts (Phase 0) — createClient(): RLS-enforced server client (await cookies())
// lib/supabase/admin.ts (Phase 0) — createAdminClient(): service-role client (server only)
// lib/repos/orgSettings.ts (Phase 0) — getOrgSettings(): Promise<OrgSettings> (gives `.timezone`)
// lib/repos/assignments.ts (Phase 3) — listAssignments({ courseId? }): Promise<Assignment[]> (RLS-scoped; rows carry absolute `due_date`)
// lib/time/format.ts (Phase 3) — formatInstant(iso, timeZone?): string; formatInstantDevice(iso): string
```

Phase 0/1 Postgres helpers assumed to exist: `is_active_admin()`, `current_status()`, `current_role()`, `is_enrolled(course_id uuid) returns boolean`, `teaches_course(course_id uuid) returns boolean`. Phase 1 tables assumed: `courses`, `enrollments`, `course_teachers`. Phase 3 table assumed: `assignments` (with absolute `due_date timestamptz`).

> If any assumed signature differs from what an earlier phase actually shipped, adapt the call sites here but keep the test contracts in this plan unchanged. Note: `lib/time/format.ts` already exists from Phase 3 — **reuse it, do not recreate it** (see the skip note in Task 5.5). Slot-expansion logic goes in a NEW file `lib/time/expandSlots.ts` to avoid collisions with that existing formatter.

---

## File map (created in this phase)

```
supabase/migrations/0006_calendar.sql                # timetable_slots + calendar_events + RLS
lib/time/expandSlots.ts                              # pure expandSlots() — wall-clock-in-anchorTz → absolute instants (TDD)
lib/validation/timetableSlot.ts                      # Zod schemas (create/update/list)
lib/validation/calendarEvent.ts                      # Zod schemas (create/update)
lib/repos/timetableSlots.ts                          # repository per spec §5 columns
lib/repos/calendarEvents.ts                          # repository per spec §5 columns
lib/calendar/merge.ts                                # pure mergeCalendar() → unified CalendarItem[] (TDD)
app/api/calendar/route.ts                            # GET ?from&to (merge slots + events + assignment due dates)
app/api/timetable/route.ts                           # GET (scoped) / POST (create slot)
app/api/timetable/[id]/route.ts                      # PATCH (update) / DELETE (deactivate slot)
app/api/events/route.ts                              # GET (scoped) / POST (create event)
app/api/events/[id]/route.ts                         # PATCH (update) / DELETE (delete event)
app/(app)/calendar/page.tsx                          # server shell (loads profile + courses)
app/(app)/calendar/CalendarView.tsx                  # client FullCalendar month⇄week + device TZ label
app/(app)/calendar/TimetableManager.tsx              # teacher/admin slot + event management (client)
tests/unit/expandSlots.test.ts
tests/unit/timetableSlotValidation.test.ts
tests/unit/calendarEventValidation.test.ts
tests/unit/mergeCalendar.test.ts
tests/integration/rls-calendar.test.ts
tests/integration/calendar-api.test.ts
tests/integration/timetable-api.test.ts
e2e/calendar.spec.ts
```

---

## Task 5.1: Migration — timetable_slots, calendar_events, RLS, policy test

**Files:**
- Create: `supabase/migrations/0006_calendar.sql`
- Test: `tests/integration/rls-calendar.test.ts`

- [ ] **Step 1: Write the failing RLS integration test**

```ts
// tests/integration/rls-calendar.test.ts
import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(url, service) // bypasses RLS — used to seed + tear down

const ids = {
  course: '00000000-0000-0000-0000-0000000c0501',
  otherCourse: '00000000-0000-0000-0000-0000000c0502',
  teacher: '00000000-0000-0000-0000-0000000a0501',
  student: '00000000-0000-0000-0000-0000000a0502',
  slot: '00000000-0000-0000-0000-0000000e0501',
  event: '00000000-0000-0000-0000-0000000f0501',
  globalEvent: '00000000-0000-0000-0000-0000000f0502',
}

beforeAll(async () => {
  await admin.from('courses').upsert([
    { id: ids.course, name: 'RLS Cal Course', status: 'active' },
    { id: ids.otherCourse, name: 'RLS Cal Other', status: 'active' },
  ])
  await admin.from('profiles').upsert([
    { id: ids.teacher, email: 'rls-cal-teach@seed.test', role: 'teacher', status: 'active' },
    { id: ids.student, email: 'rls-cal-stud@seed.test', role: 'student', status: 'active' },
  ], { onConflict: 'id' })
  await admin.from('course_teachers').upsert({ teacher_id: ids.teacher, course_id: ids.course })
  await admin.from('enrollments').upsert({ student_id: ids.student, course_id: ids.course })
  await admin.from('timetable_slots').upsert({
    id: ids.slot, course_id: ids.course, subject: 'Maths', teacher_id: ids.teacher,
    day_of_week: 1, start_time: '09:00', end_time: '10:00', mode_or_location: 'Room 1', active: true,
  })
  await admin.from('calendar_events').upsert([
    { id: ids.event, title: 'Course Event', event_date: '2026-07-15', course_id: ids.course, kind: 'event', created_by: ids.teacher },
    { id: ids.globalEvent, title: 'Holiday', event_date: '2026-08-15', course_id: null, kind: 'holiday', created_by: ids.teacher },
  ])
})

afterAll(async () => {
  await admin.from('calendar_events').delete().in('id', [ids.event, ids.globalEvent])
  await admin.from('timetable_slots').delete().eq('id', ids.slot)
  await admin.from('course_teachers').delete().eq('course_id', ids.course)
  await admin.from('enrollments').delete().eq('course_id', ids.course)
  await admin.from('profiles').delete().in('id', [ids.teacher, ids.student])
  await admin.from('courses').delete().in('id', [ids.course, ids.otherCourse])
})

describe('timetable_slots RLS', () => {
  it('anon cannot read timetable_slots', async () => {
    const c = createClient(url, anon)
    const { data, error } = await c.from('timetable_slots').select('*')
    expect(error ?? (data?.length ?? 0) === 0).toBeTruthy()
  })
  it('service role sees the seeded slot (sanity)', async () => {
    const { data, error } = await admin.from('timetable_slots').select('id').eq('id', ids.slot).single()
    expect(error).toBeNull()
    expect(data?.id).toBe(ids.slot)
  })
})

describe('calendar_events RLS', () => {
  it('anon cannot read calendar_events', async () => {
    const c = createClient(url, anon)
    const { data, error } = await c.from('calendar_events').select('*')
    expect(error ?? (data?.length ?? 0) === 0).toBeTruthy()
  })
  it('service role sees both the course and global events (sanity)', async () => {
    const { data, error } = await admin.from('calendar_events').select('id').in('id', [ids.event, ids.globalEvent])
    expect(error).toBeNull()
    expect((data?.length ?? 0)).toBe(2)
  })
})
```

> Note: full per-role JWT RLS assertions (enrolled-student read scope, teacher-of-course write scope, admin override) are exercised end-to-end in the API integration tests (Tasks 5.4–5.5) where a real signed-in session exists. This file proves the **tables + RLS exist**, anon is blocked, and the column shapes match the spec. Keep it lightweight and deterministic.

- [ ] **Step 2: Run it — must fail (tables missing)**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/rls-calendar.test.ts`
Expected: FAIL — relation "timetable_slots" does not exist.

- [ ] **Step 3: Write the migration** — `supabase/migrations/0006_calendar.sql`

```sql
-- supabase/migrations/0006_calendar.sql
-- Phase 5: timetable_slots + calendar_events (spec §5, §5.1 RLS, §7.6, §8 timezone).
-- Assumes Phase 0 (profiles, is_active_admin, current_status, current_role),
-- Phase 1 (courses, enrollments, course_teachers, is_enrolled, teaches_course) exist.

create type calendar_event_kind as enum ('event', 'holiday', 'cancellation', 'reschedule');

-- Recurring weekly schedule. Times are WALL-CLOCK in the institute anchor timezone
-- (org_settings.timezone); each occurrence is expanded to an absolute instant before display.
create table timetable_slots (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  subject text not null,
  teacher_id uuid references profiles(id),
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0=Sun .. 6=Sat
  start_time time not null,                          -- wall-clock in org_settings.timezone
  end_time time not null,                            -- wall-clock in org_settings.timezone
  mode_or_location text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint timetable_slots_time_order check (end_time > start_time)
);
create index timetable_slots_course_idx on timetable_slots (course_id);
create index timetable_slots_active_idx on timetable_slots (active);

-- One-off events / holidays / cancellations / reschedules; optional course (null = global).
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date not null,
  start_time time,                                   -- optional wall-clock (org_settings.timezone)
  end_time time,                                      -- optional wall-clock (org_settings.timezone)
  course_id uuid references courses(id) on delete cascade,  -- null = global
  kind calendar_event_kind not null default 'event',
  slot_id uuid references timetable_slots(id) on delete set null,  -- for slot overrides
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index calendar_events_course_idx on calendar_events (course_id);
create index calendar_events_date_idx on calendar_events (event_date);

alter table timetable_slots enable row level security;
alter table calendar_events enable row level security;

-- ── timetable_slots policies ─────────────────────────────────────────
-- Read: enrolled student of the course, teacher-of-course, or admin.
create policy timetable_slots_read on timetable_slots for select
  using (
    is_active_admin()
    or teaches_course(course_id)
    or is_enrolled(course_id)
  );
-- Write (insert/update/delete): teacher-of-course or admin.
create policy timetable_slots_write on timetable_slots for all
  using (is_active_admin() or teaches_course(course_id))
  with check (is_active_admin() or teaches_course(course_id));

-- ── calendar_events policies ─────────────────────────────────────────
-- Read: global events (course_id null) are visible to every active user; course events
-- are visible to enrolled student / teacher-of-course / admin.
create policy calendar_events_read on calendar_events for select
  using (
    is_active_admin()
    or (course_id is null and current_status() = 'active')
    or teaches_course(course_id)
    or is_enrolled(course_id)
  );
-- Write: admin can write any event (incl. global); a teacher may write only events for a
-- course they teach (cannot create global events — those are admin-only).
create policy calendar_events_write on calendar_events for all
  using (
    is_active_admin()
    or (course_id is not null and teaches_course(course_id))
  )
  with check (
    is_active_admin()
    or (course_id is not null and teaches_course(course_id))
  );
```

- [ ] **Step 4: Apply the migration**

Run (Supabase CLI linked to `cert-ed-prod`): `supabase db push`
(or paste the SQL into the Supabase SQL editor for the prod project.)
Expected: success; `timetable_slots` and `calendar_events` created with RLS enabled.

- [ ] **Step 5: Run the RLS test — must pass**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/rls-calendar.test.ts`
Expected: PASS (anon blocked on both tables; service-role sanity reads succeed; column shapes accepted).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0006_calendar.sql tests/integration/rls-calendar.test.ts
git commit -m "feat: timetable_slots + calendar_events schema with RLS (phase 5)"
```

---

## Task 5.2: Repos + Zod for timetableSlots and calendarEvents

**Files:**
- Create: `lib/validation/timetableSlot.ts`, `lib/validation/calendarEvent.ts`, `lib/repos/timetableSlots.ts`, `lib/repos/calendarEvents.ts`
- Test: `tests/unit/timetableSlotValidation.test.ts`, `tests/unit/calendarEventValidation.test.ts`

- [ ] **Step 1: Write the failing validation tests**

```ts
// tests/unit/timetableSlotValidation.test.ts
import { describe, it, expect } from 'vitest'
import { createSlotSchema, updateSlotSchema } from '@/lib/validation/timetableSlot'

const base = {
  course_id: '00000000-0000-0000-0000-0000000c0501',
  subject: 'Maths',
  teacher_id: '00000000-0000-0000-0000-0000000a0501',
  day_of_week: 1,
  start_time: '09:00',
  end_time: '10:00',
  mode_or_location: 'Room 1',
}

describe('createSlotSchema', () => {
  it('accepts a valid slot', () => {
    expect(createSlotSchema.safeParse(base).success).toBe(true)
  })
  it('accepts a slot without a teacher or location', () => {
    const { teacher_id, mode_or_location, ...rest } = base
    expect(createSlotSchema.safeParse(rest).success).toBe(true)
  })
  it('rejects a non-uuid course_id', () => {
    expect(createSlotSchema.safeParse({ ...base, course_id: 'nope' }).success).toBe(false)
  })
  it('rejects day_of_week out of 0..6', () => {
    expect(createSlotSchema.safeParse({ ...base, day_of_week: 7 }).success).toBe(false)
    expect(createSlotSchema.safeParse({ ...base, day_of_week: -1 }).success).toBe(false)
  })
  it('rejects a non HH:mm start_time', () => {
    expect(createSlotSchema.safeParse({ ...base, start_time: '9am' }).success).toBe(false)
  })
  it('rejects end_time not after start_time', () => {
    expect(createSlotSchema.safeParse({ ...base, start_time: '10:00', end_time: '09:00' }).success).toBe(false)
    expect(createSlotSchema.safeParse({ ...base, start_time: '10:00', end_time: '10:00' }).success).toBe(false)
  })
})

describe('updateSlotSchema', () => {
  it('allows a partial update (subject only)', () => {
    expect(updateSlotSchema.safeParse({ subject: 'Physics' }).success).toBe(true)
  })
  it('allows deactivating via active=false', () => {
    expect(updateSlotSchema.safeParse({ active: false }).success).toBe(true)
  })
  it('still rejects an out-of-range day_of_week', () => {
    expect(updateSlotSchema.safeParse({ day_of_week: 9 }).success).toBe(false)
  })
})
```

```ts
// tests/unit/calendarEventValidation.test.ts
import { describe, it, expect } from 'vitest'
import { createEventSchema, updateEventSchema } from '@/lib/validation/calendarEvent'

const base = {
  title: 'Parents meeting',
  description: 'Term 1 review',
  event_date: '2026-07-15',
  start_time: '14:00',
  end_time: '15:00',
  course_id: '00000000-0000-0000-0000-0000000c0501',
  kind: 'event',
}

describe('createEventSchema', () => {
  it('accepts a valid course event', () => {
    expect(createEventSchema.safeParse(base).success).toBe(true)
  })
  it('accepts a global all-day event (no course, no times)', () => {
    expect(createEventSchema.safeParse({
      title: 'Holiday', event_date: '2026-08-15', course_id: null, kind: 'holiday',
    }).success).toBe(true)
  })
  it('rejects an unknown kind', () => {
    expect(createEventSchema.safeParse({ ...base, kind: 'party' }).success).toBe(false)
  })
  it('rejects a non-ISO event_date', () => {
    expect(createEventSchema.safeParse({ ...base, event_date: '15/07/2026' }).success).toBe(false)
  })
  it('rejects an end_time without a start_time', () => {
    const { start_time, ...rest } = base
    expect(createEventSchema.safeParse(rest).success).toBe(false)
  })
  it('rejects end_time not after start_time when both given', () => {
    expect(createEventSchema.safeParse({ ...base, start_time: '15:00', end_time: '14:00' }).success).toBe(false)
  })
})

describe('updateEventSchema', () => {
  it('allows a partial update (title only)', () => {
    expect(updateEventSchema.safeParse({ title: 'Renamed' }).success).toBe(true)
  })
  it('rejects an unknown kind on update', () => {
    expect(updateEventSchema.safeParse({ kind: 'nope' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/timetableSlotValidation.test.ts tests/unit/calendarEventValidation.test.ts` — Expected: FAIL (no modules).

- [ ] **Step 3: Implement the Zod schemas**

`lib/validation/timetableSlot.ts`:
```ts
import { z } from 'zod'

// "HH:mm" 24-hour wall clock (anchored to org_settings.timezone).
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:mm (24h)')

export const createSlotSchema = z
  .object({
    course_id: z.string().uuid(),
    subject: z.string().min(1).max(200),
    teacher_id: z.string().uuid().optional(),
    day_of_week: z.number().int().min(0).max(6),
    start_time: hhmm,
    end_time: hhmm,
    mode_or_location: z.string().max(200).optional(),
  })
  .refine((v) => v.end_time > v.start_time, {
    message: 'end_time must be after start_time',
    path: ['end_time'],
  })

export const updateSlotSchema = z
  .object({
    subject: z.string().min(1).max(200),
    teacher_id: z.string().uuid().nullable(),
    day_of_week: z.number().int().min(0).max(6),
    start_time: hhmm,
    end_time: hhmm,
    mode_or_location: z.string().max(200).nullable(),
    active: z.boolean(),
  })
  .partial()

export type CreateSlotInput = z.infer<typeof createSlotSchema>
export type UpdateSlotInput = z.infer<typeof updateSlotSchema>
export { hhmm }
```

`lib/validation/calendarEvent.ts`:
```ts
import { z } from 'zod'
import { hhmm } from '@/lib/validation/timetableSlot'

// "YYYY-MM-DD" calendar date (interpreted as a wall-clock date in org_settings.timezone).
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')

export const calendarEventKind = z.enum(['event', 'holiday', 'cancellation', 'reschedule'])

export const createEventSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    event_date: isoDate,
    start_time: hhmm.optional(),
    end_time: hhmm.optional(),
    course_id: z.string().uuid().nullable().optional(),
    kind: calendarEventKind,
    slot_id: z.string().uuid().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.end_time != null && v.start_time == null) {
      ctx.addIssue({ code: 'custom', message: 'end_time requires a start_time', path: ['start_time'] })
    }
    if (v.start_time != null && v.end_time != null && v.end_time <= v.start_time) {
      ctx.addIssue({ code: 'custom', message: 'end_time must be after start_time', path: ['end_time'] })
    }
  })

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).nullable(),
    event_date: isoDate,
    start_time: hhmm.nullable(),
    end_time: hhmm.nullable(),
    course_id: z.string().uuid().nullable(),
    kind: calendarEventKind,
    slot_id: z.string().uuid().nullable(),
  })
  .partial()

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
export { isoDate }
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/timetableSlotValidation.test.ts tests/unit/calendarEventValidation.test.ts` — Expected: PASS.

- [ ] **Step 5: Implement the repositories**

`lib/repos/timetableSlots.ts`:
```ts
import { createClient } from '@/lib/supabase/server'
import type { CreateSlotInput, UpdateSlotInput } from '@/lib/validation/timetableSlot'

export type TimetableSlot = {
  id: string
  course_id: string
  subject: string
  teacher_id: string | null
  day_of_week: number
  start_time: string   // "HH:mm[:ss]" wall-clock in org_settings.timezone
  end_time: string
  mode_or_location: string | null
  active: boolean
  created_at: string
}

// RLS scopes the rows: enrolled student / teacher-of-course / admin.
export async function listSlots(opts: { courseId?: string; activeOnly?: boolean } = {}): Promise<TimetableSlot[]> {
  const supabase = await createClient()
  let q = supabase.from('timetable_slots').select('*').order('day_of_week', { ascending: true })
  if (opts.courseId) q = q.eq('course_id', opts.courseId)
  if (opts.activeOnly !== false) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw new Error(`listSlots: ${error.message}`)
  return (data ?? []) as TimetableSlot[]
}

export async function getSlot(id: string): Promise<TimetableSlot | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('timetable_slots').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getSlot: ${error.message}`)
  return (data as TimetableSlot) ?? null
}

export async function createSlot(input: CreateSlotInput): Promise<TimetableSlot> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('timetable_slots')
    .insert({
      course_id: input.course_id,
      subject: input.subject,
      teacher_id: input.teacher_id ?? null,
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      end_time: input.end_time,
      mode_or_location: input.mode_or_location ?? null,
      active: true,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createSlot: ${error.message}`)
  return data as TimetableSlot
}

export async function updateSlot(id: string, patch: UpdateSlotInput): Promise<TimetableSlot> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('timetable_slots').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`updateSlot: ${error.message}`)
  return data as TimetableSlot
}

// Deactivate = soft-delete (spec §8: content soft-deleted; the slot stops expanding).
export async function deactivateSlot(id: string): Promise<TimetableSlot> {
  return updateSlot(id, { active: false })
}
```

`lib/repos/calendarEvents.ts`:
```ts
import { createClient } from '@/lib/supabase/server'
import type { CreateEventInput, UpdateEventInput } from '@/lib/validation/calendarEvent'

export type CalendarEventKind = 'event' | 'holiday' | 'cancellation' | 'reschedule'

export type CalendarEvent = {
  id: string
  title: string
  description: string | null
  event_date: string   // "YYYY-MM-DD" wall-clock date in org_settings.timezone
  start_time: string | null
  end_time: string | null
  course_id: string | null   // null = global
  kind: CalendarEventKind
  slot_id: string | null
  created_by: string
  created_at: string
}

// RLS scopes the rows: global events + enrolled/taught course events / admin sees all.
export async function listEvents(opts: { from?: string; to?: string } = {}): Promise<CalendarEvent[]> {
  const supabase = await createClient()
  let q = supabase.from('calendar_events').select('*').order('event_date', { ascending: true })
  if (opts.from) q = q.gte('event_date', opts.from)
  if (opts.to) q = q.lte('event_date', opts.to)
  const { data, error } = await q
  if (error) throw new Error(`listEvents: ${error.message}`)
  return (data ?? []) as CalendarEvent[]
}

export async function getEvent(id: string): Promise<CalendarEvent | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('calendar_events').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getEvent: ${error.message}`)
  return (data as CalendarEvent) ?? null
}

export async function createEvent(input: CreateEventInput, createdBy: string): Promise<CalendarEvent> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      title: input.title,
      description: input.description ?? null,
      event_date: input.event_date,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      course_id: input.course_id ?? null,
      kind: input.kind,
      slot_id: input.slot_id ?? null,
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createEvent: ${error.message}`)
  return data as CalendarEvent
}

export async function updateEvent(id: string, patch: UpdateEventInput): Promise<CalendarEvent> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('calendar_events').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`updateEvent: ${error.message}`)
  return data as CalendarEvent
}

export async function deleteEvent(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw new Error(`deleteEvent: ${error.message}`)
}
```

- [ ] **Step 6: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/repos/timetableSlots.ts lib/repos/calendarEvents.ts lib/validation/timetableSlot.ts lib/validation/calendarEvent.ts tests/unit/timetableSlotValidation.test.ts tests/unit/calendarEventValidation.test.ts
git commit -m "feat: timetable slot/calendar event repos + zod schemas"
```

---

## Task 5.3: Slot expansion — wall-clock-in-anchorTz → absolute instants (TDD)

> Spec §8/§7.6: recurring slot times are wall-clock anchored to `org_settings.timezone`, expanded to **absolute instants** for each occurrence, then displayed in the viewer's device timezone. This is the single most important unit to get right: it must produce a correct UTC instant for a wall-clock time in an arbitrary IANA zone, across DST/offset changes, so that *later formatting in a different device timezone* still points at the same real-world moment.

**Files:**
- Create: `lib/time/expandSlots.ts`
- Test: `tests/unit/expandSlots.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/expandSlots.test.ts
import { describe, it, expect } from 'vitest'
import { expandSlots, type ExpandableSlot } from '@/lib/time/expandSlots'
import { formatInstant } from '@/lib/time/format'

// A Monday 09:00–10:00 slot anchored to Asia/Kolkata (UTC+5:30, no DST).
const istSlot: ExpandableSlot = {
  id: 's-ist', day_of_week: 1, start_time: '09:00', end_time: '10:00',
}
// A Monday 09:00–10:00 slot anchored to a DST zone (America/New_York: -05:00 winter, -04:00 summer).
const nySlot: ExpandableSlot = {
  id: 's-ny', day_of_week: 1, start_time: '09:00', end_time: '10:00',
}

describe('expandSlots', () => {
  it('expands one occurrence per matching weekday in the range', () => {
    // 2026-07-06 is a Monday; range covers exactly one Monday.
    const occ = expandSlots([istSlot], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'Asia/Kolkata')
    expect(occ).toHaveLength(1)
    expect(occ[0].slotId).toBe('s-ist')
  })

  it('produces the correct absolute UTC instant for an IST wall-clock time', () => {
    // 09:00 IST on Mon 2026-07-06 === 03:30 UTC.
    const occ = expandSlots([istSlot], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'Asia/Kolkata')
    expect(occ[0].startIso).toBe('2026-07-06T03:30:00.000Z')
    expect(occ[0].endIso).toBe('2026-07-06T04:30:00.000Z')
  })

  it('expands multiple Mondays across a multi-week range', () => {
    // 2026-07-06, 2026-07-13, 2026-07-20 are Mondays.
    const occ = expandSlots([istSlot], '2026-07-06T00:00:00Z', '2026-07-21T00:00:00Z', 'Asia/Kolkata')
    expect(occ.map((o) => o.startIso)).toEqual([
      '2026-07-06T03:30:00.000Z',
      '2026-07-13T03:30:00.000Z',
      '2026-07-20T03:30:00.000Z',
    ])
  })

  it('is DST-safe: a summer NY slot uses the -04:00 offset', () => {
    // 09:00 America/New_York on Mon 2026-07-06 (EDT, -04:00) === 13:00 UTC.
    const occ = expandSlots([nySlot], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'America/New_York')
    expect(occ[0].startIso).toBe('2026-07-06T13:00:00.000Z')
  })

  it('is DST-safe: a winter NY slot uses the -05:00 offset', () => {
    // 09:00 America/New_York on Mon 2026-01-05 (EST, -05:00) === 14:00 UTC.
    const occ = expandSlots([nySlot], '2026-01-05T00:00:00Z', '2026-01-06T00:00:00Z', 'America/New_York')
    expect(occ[0].startIso).toBe('2026-01-05T14:00:00.000Z')
  })

  it('the absolute instant is correct when later formatted in a DIFFERENT device TZ', () => {
    // IST slot at 09:00 IST === 03:30 UTC. Viewed in UTC it must read 03:30; in IST, 09:00.
    const occ = expandSlots([istSlot], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'Asia/Kolkata')
    expect(formatInstant(occ[0].startIso, 'UTC')).toMatch(/03:30/)
    expect(formatInstant(occ[0].startIso, 'Asia/Kolkata')).toMatch(/09:00/)
  })

  it('skips inactive expansion when no weekday matches the range', () => {
    // Range Tue→Wed only; no Monday inside.
    const occ = expandSlots([istSlot], '2026-07-07T00:00:00Z', '2026-07-09T00:00:00Z', 'Asia/Kolkata')
    expect(occ).toHaveLength(0)
  })

  it('throws on an unparseable range bound', () => {
    expect(() => expandSlots([istSlot], 'not-a-date', '2026-07-07T00:00:00Z', 'Asia/Kolkata'))
      .toThrow('invalid range')
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/expandSlots.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement** — `lib/time/expandSlots.ts`

```ts
/**
 * Expand recurring weekly timetable slots into absolute UTC instants across a range.
 *
 * Each slot carries a WALL-CLOCK start/end time and a day_of_week, anchored to the
 * institute timezone (`anchorTz`, from org_settings.timezone). For every calendar day in
 * [rangeStartIso, rangeEndIso) whose weekday matches, we compute the exact UTC instant for
 * that wall-clock time IN THE ANCHOR ZONE (DST-aware), so the produced `startIso`/`endIso`
 * point at the correct real-world moment regardless of any later display timezone.
 */
export type ExpandableSlot = {
  id: string
  day_of_week: number   // 0=Sun .. 6=Sat
  start_time: string    // "HH:mm" or "HH:mm:ss"
  end_time: string
}

export type SlotOccurrence = {
  slotId: string
  startIso: string      // absolute UTC instant
  endIso: string        // absolute UTC instant
}

const DAY_MS = 24 * 60 * 60 * 1000

// Parse "HH:mm[:ss]" → { h, m }.
function parseHm(t: string): { h: number; m: number } {
  const [h, m] = t.split(':')
  return { h: Number(h), m: Number(m) }
}

// Offset (ms) of `tz` from UTC at a given instant: how much later local wall clock is vs UTC.
// Uses Intl to read the zoned wall-clock fields back, which is DST-correct.
function tzOffsetMs(instantMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(instantMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUTC - instantMs
}

// Absolute UTC ms for a wall-clock Y-M-D H:M in `tz` (DST-correct, two-pass fixpoint).
function zonedWallClockToUtcMs(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, 0)
  let guess = naiveUtc - tzOffsetMs(naiveUtc, tz)
  // refine once more in case the first guess landed on the wrong side of a DST transition
  guess = naiveUtc - tzOffsetMs(guess, tz)
  return guess
}

// Y/M/D weekday (0=Sun) of an instant interpreted in `tz`.
function zonedYmdWeekday(instantMs: number, tz: string): { y: number; mo: number; d: number; wd: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(instantMs))
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { y: Number(get('year')), mo: Number(get('month')), d: Number(get('day')), wd: wdMap[get('weekday')] }
}

export function expandSlots(
  slots: ExpandableSlot[],
  rangeStartIso: string,
  rangeEndIso: string,
  anchorTz: string,
): SlotOccurrence[] {
  const startMs = Date.parse(rangeStartIso)
  const endMs = Date.parse(rangeEndIso)
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) throw new Error('invalid range')

  const occ: SlotOccurrence[] = []
  // Iterate calendar days in the anchor zone. Step in 24h hops from the range start; for each
  // day, read its zoned Y/M/D + weekday and emit matching slots' wall-clock times as instants.
  for (let cursor = startMs; cursor < endMs; cursor += DAY_MS) {
    const { y, mo, d, wd } = zonedYmdWeekday(cursor, anchorTz)
    for (const slot of slots) {
      if (slot.day_of_week !== wd) continue
      const s = parseHm(slot.start_time)
      const e = parseHm(slot.end_time)
      const startInstant = zonedWallClockToUtcMs(y, mo, d, s.h, s.m, anchorTz)
      const endInstant = zonedWallClockToUtcMs(y, mo, d, e.h, e.m, anchorTz)
      if (startInstant >= startMs && startInstant < endMs) {
        occ.push({
          slotId: slot.id,
          startIso: new Date(startInstant).toISOString(),
          endIso: new Date(endInstant).toISOString(),
        })
      }
    }
  }
  occ.sort((a, b) => a.startIso.localeCompare(b.startIso))
  return occ
}
```

> Implementation note: `tzOffsetMs` reads the zoned wall-clock back via `Intl.DateTimeFormat` (the only DST-correct primitive available without a date library), and `zonedWallClockToUtcMs` refines its guess once to survive DST-transition days. This keeps the file dependency-free (no `luxon`/`date-fns-tz`), matching the project's lean-deps stance. The 24h-hop day cursor is robust because we re-derive the zoned date for each step rather than trusting arithmetic across DST.

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/expandSlots.test.ts` — Expected: PASS (all cases incl. IST exactness, NY summer/winter DST offsets, cross-TZ formatting, empty range, invalid range).

- [ ] **Step 5: Commit**

```bash
git add lib/time/expandSlots.ts tests/unit/expandSlots.test.ts
git commit -m "feat: DST-safe timetable slot expansion to absolute instants"
```

---

## Task 5.4: Calendar merge — unified item list (TDD pure function)

> Spec §7.6: the calendar overlays expanded `timetable_slots` (recurring weekly) + `calendar_events` (one-offs/holidays/cancellations/reschedules) + assignment `due_date`s into one event list. The merge is a pure function over already-fetched rows so it is deterministic and unit-testable; the API route (Task 5.5) does the RLS-scoped fetching + slot expansion and then calls this.

**Files:**
- Create: `lib/calendar/merge.ts`
- Test: `tests/unit/mergeCalendar.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/mergeCalendar.test.ts
import { describe, it, expect } from 'vitest'
import { mergeCalendar, type MergeInput } from '@/lib/calendar/merge'

const input: MergeInput = {
  slotOccurrences: [
    { slotId: 's-1', startIso: '2026-07-06T03:30:00.000Z', endIso: '2026-07-06T04:30:00.000Z' },
  ],
  slotMeta: { 's-1': { subject: 'Maths', courseId: 'c-1', location: 'Room 1' } },
  events: [
    { id: 'e-1', title: 'Holiday', event_date: '2026-07-15', start_time: null, end_time: null, course_id: null, kind: 'holiday' },
    { id: 'e-2', title: 'Extra class', event_date: '2026-07-10', start_time: '14:00', end_time: '15:00', course_id: 'c-1', kind: 'event' },
  ],
  assignments: [
    { id: 'a-1', title: 'HW 1', due_date: '2026-07-12T18:30:00.000Z', course_id: 'c-1' },
  ],
  anchorTz: 'Asia/Kolkata',
}

describe('mergeCalendar', () => {
  it('represents every source as a calendar item', () => {
    const items = mergeCalendar(input)
    const sources = new Set(items.map((i) => i.source))
    expect(sources).toEqual(new Set(['slot', 'event', 'assignment']))
    expect(items).toHaveLength(4)
  })

  it('maps a slot occurrence to a timed item with subject + location', () => {
    const slot = mergeCalendar(input).find((i) => i.source === 'slot')!
    expect(slot.title).toMatch(/Maths/)
    expect(slot.start).toBe('2026-07-06T03:30:00.000Z')
    expect(slot.end).toBe('2026-07-06T04:30:00.000Z')
    expect(slot.allDay).toBe(false)
  })

  it('maps an all-day (no-time) event to an allDay item', () => {
    const ev = mergeCalendar(input).find((i) => i.id === 'event-e-1')!
    expect(ev.allDay).toBe(true)
    expect(ev.title).toMatch(/Holiday/)
  })

  it('maps a timed event to an absolute instant in the anchor TZ', () => {
    // 14:00 IST on 2026-07-10 === 08:30 UTC.
    const ev = mergeCalendar(input).find((i) => i.id === 'event-e-2')!
    expect(ev.allDay).toBe(false)
    expect(ev.start).toBe('2026-07-10T08:30:00.000Z')
  })

  it('maps an assignment due date to a deadline item at the absolute instant', () => {
    const due = mergeCalendar(input).find((i) => i.source === 'assignment')!
    expect(due.title).toMatch(/Due: HW 1/)
    expect(due.start).toBe('2026-07-12T18:30:00.000Z')
    expect(due.allDay).toBe(false)
  })

  it('produces stable, source-prefixed ids and a kind tag', () => {
    const items = mergeCalendar(input)
    expect(items.find((i) => i.source === 'slot')!.id).toMatch(/^slot-/)
    expect(items.find((i) => i.source === 'assignment')!.id).toBe('assignment-a-1')
    expect(items.find((i) => i.id === 'event-e-1')!.kind).toBe('holiday')
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/mergeCalendar.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement** — `lib/calendar/merge.ts`

```ts
import type { SlotOccurrence } from '@/lib/time/expandSlots'
import type { CalendarEventKind } from '@/lib/repos/calendarEvents'

// A wall-clock "YYYY-MM-DD" + "HH:mm" in `anchorTz` → absolute UTC instant.
// Reuses the same DST-correct primitive as expandSlots, kept local to avoid a circular import.
function zonedDateTimeToIso(dateYmd: string, hm: string, anchorTz: string): string {
  const [y, mo, d] = dateYmd.split('-').map(Number)
  const [h, mi] = hm.split(':').map(Number)
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, 0)
  const offset = (instantMs: number): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: anchorTz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(instantMs))
    const g = (t: string) => Number(parts.find((p) => p.type === t)!.value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - instantMs
  }
  let guess = naiveUtc - offset(naiveUtc)
  guess = naiveUtc - offset(guess)
  return new Date(guess).toISOString()
}

export type CalendarSource = 'slot' | 'event' | 'assignment'

export type CalendarItem = {
  id: string                 // source-prefixed, stable
  source: CalendarSource
  title: string
  start: string              // absolute UTC ISO, OR "YYYY-MM-DD" when allDay
  end: string | null
  allDay: boolean
  courseId: string | null
  kind: CalendarEventKind | 'timetable' | 'deadline'
  location?: string | null
}

export type MergeInput = {
  slotOccurrences: SlotOccurrence[]
  slotMeta: Record<string, { subject: string; courseId: string; location: string | null }>
  events: Array<{
    id: string; title: string; event_date: string
    start_time: string | null; end_time: string | null
    course_id: string | null; kind: CalendarEventKind
  }>
  assignments: Array<{ id: string; title: string; due_date: string; course_id: string }>
  anchorTz: string
}

export function mergeCalendar(input: MergeInput): CalendarItem[] {
  const items: CalendarItem[] = []

  for (const occ of input.slotOccurrences) {
    const meta = input.slotMeta[occ.slotId]
    items.push({
      id: `slot-${occ.slotId}-${occ.startIso}`,
      source: 'slot',
      title: meta ? `${meta.subject}${meta.location ? ` · ${meta.location}` : ''}` : 'Class',
      start: occ.startIso,
      end: occ.endIso,
      allDay: false,
      courseId: meta?.courseId ?? null,
      kind: 'timetable',
      location: meta?.location ?? null,
    })
  }

  for (const ev of input.events) {
    const timed = ev.start_time != null
    items.push({
      id: `event-${ev.id}`,
      source: 'event',
      title: ev.title,
      start: timed ? zonedDateTimeToIso(ev.event_date, ev.start_time!, input.anchorTz) : ev.event_date,
      end: timed && ev.end_time ? zonedDateTimeToIso(ev.event_date, ev.end_time, input.anchorTz) : null,
      allDay: !timed,
      courseId: ev.course_id,
      kind: ev.kind,
    })
  }

  for (const a of input.assignments) {
    items.push({
      id: `assignment-${a.id}`,
      source: 'assignment',
      title: `Due: ${a.title}`,
      start: a.due_date,   // already an absolute instant (Phase 3 stores UTC)
      end: null,
      allDay: false,
      courseId: a.course_id,
      kind: 'deadline',
    })
  }

  return items
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/mergeCalendar.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/merge.ts tests/unit/mergeCalendar.test.ts
git commit -m "feat: pure calendar merge of slots + events + deadlines"
```

---

## Task 5.5: Calendar API (GET ?from&to) — RLS-scoped merge

> Spec §6: `calendar` (GET). The route fetches RLS-scoped slots, events and assignment due dates for the requester, expands recurring slots over the requested `[from, to)` range using `org_settings.timezone` as the anchor, merges all three sources, and returns the unified list. Because every read goes through the RLS-enforced server client, the requester only ever sees data for their enrolled (student) / taught (teacher) / all (admin) courses + global events.

**Files:**
- Create: `app/api/calendar/route.ts`
- Test: `tests/integration/calendar-api.test.ts`

> `lib/time/format.ts` (`formatInstant`/`formatInstantDevice`) already exists from Phase 3 — **reuse it; do not recreate it.** This task adds no new time-format file; display formatting lives in the client UI (Task 5.6).

- [ ] **Step 1: Write the failing API integration test** (merge composition + scoping are the key assertions; repos/expansion mocked for determinism)

```ts
// tests/integration/calendar-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'stud-1', email: 's@x.c', role: 'student', status: 'active' } as any
vi.mock('@/lib/auth/profile', () => ({ getProfile: vi.fn(async () => profile) }))

// org timezone anchor
vi.mock('@/lib/repos/orgSettings', () => ({
  getOrgSettings: vi.fn(async () => ({ timezone: 'Asia/Kolkata' })),
}))

// RLS-scoped repo reads (the route trusts RLS to scope; here we return fixed rows)
const listSlots = vi.fn(async () => [
  { id: 's-1', course_id: 'c-1', subject: 'Maths', teacher_id: null,
    day_of_week: 1, start_time: '09:00', end_time: '10:00', mode_or_location: 'Room 1', active: true },
])
vi.mock('@/lib/repos/timetableSlots', () => ({ listSlots: (...a: any[]) => listSlots(...a) }))

const listEvents = vi.fn(async () => [
  { id: 'e-1', title: 'Holiday', event_date: '2026-07-13', start_time: null, end_time: null, course_id: null, kind: 'holiday' },
])
vi.mock('@/lib/repos/calendarEvents', () => ({ listEvents: (...a: any[]) => listEvents(...a) }))

const listAssignments = vi.fn(async () => [
  { id: 'a-1', course_id: 'c-1', title: 'HW 1', due_date: '2026-07-12T18:30:00.000Z', status: 'active' },
])
vi.mock('@/lib/repos/assignments', () => ({ listAssignments: (...a: any[]) => listAssignments(...a) }))

import { GET } from '@/app/api/calendar/route'

const req = (qs: string) => new Request(`http://t/api/calendar${qs}`)

beforeEach(() => { profile.status = 'active' })

describe('GET /api/calendar', () => {
  it('rejects a missing from/to range with 400', async () => {
    const res = await GET(req(''))
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('rejects an unauthenticated/inactive caller with 401', async () => {
    profile.status = 'pending'
    const res = await GET(req('?from=2026-07-06&to=2026-07-21'))
    expect(res.status).toBe(401)
  })

  it('merges all three sources within the range', async () => {
    const res = await GET(req('?from=2026-07-06&to=2026-07-21'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    const sources = new Set(json.data.items.map((i: any) => i.source))
    expect(sources).toEqual(new Set(['slot', 'event', 'assignment']))
    // anchor TZ echoed for the client to label/render with
    expect(json.data.anchorTz).toBe('Asia/Kolkata')
  })

  it('expands the Monday slot to its absolute IST instant (09:00 IST === 03:30 UTC)', async () => {
    const res = await GET(req('?from=2026-07-06&to=2026-07-21'))
    const json = await res.json()
    const slot = json.data.items.find((i: any) => i.source === 'slot')
    expect(slot.start).toBe('2026-07-06T03:30:00.000Z')
  })

  it('passes the range to the assignment + event reads (scoping respected via RLS)', async () => {
    await GET(req('?from=2026-07-06&to=2026-07-21'))
    expect(listSlots).toHaveBeenCalled()
    expect(listAssignments).toHaveBeenCalled()
    expect(listEvents).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-07-06', to: '2026-07-21' }))
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/integration/calendar-api.test.ts` — Expected: FAIL (no route module).

- [ ] **Step 3: Implement** — `app/api/calendar/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { getOrgSettings } from '@/lib/repos/orgSettings'
import { listSlots } from '@/lib/repos/timetableSlots'
import { listEvents } from '@/lib/repos/calendarEvents'
import { listAssignments } from '@/lib/repos/assignments'
import { expandSlots, type ExpandableSlot } from '@/lib/time/expandSlots'
import { mergeCalendar } from '@/lib/calendar/merge'

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (!from || !to || !isoDate.test(from) || !isoDate.test(to)) return fail('from/to required (YYYY-MM-DD)', 400)
  if (to <= from) return fail('to must be after from', 400)

  const org = await getOrgSettings()
  const anchorTz = org.timezone

  // RLS scopes every read to the requester's courses + global events.
  const [slots, events, assignments] = await Promise.all([
    listSlots({ activeOnly: true }),
    listEvents({ from, to }),
    listAssignments({}),
  ])

  // Expand recurring slots across the [from, to) range, anchored to the institute TZ.
  const expandable: ExpandableSlot[] = slots.map((s) => ({
    id: s.id, day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time,
  }))
  const slotOccurrences = expandSlots(
    expandable,
    `${from}T00:00:00Z`,
    `${to}T00:00:00Z`,
    anchorTz,
  )
  const slotMeta = Object.fromEntries(
    slots.map((s) => [s.id, { subject: s.subject, courseId: s.course_id, location: s.mode_or_location }]),
  )

  // Keep only assignment due dates that fall within the requested range.
  const fromMs = Date.parse(`${from}T00:00:00Z`)
  const toMs = Date.parse(`${to}T00:00:00Z`)
  const dueInRange = assignments
    .filter((a) => a.status === 'active')
    .filter((a) => {
      const ms = Date.parse(a.due_date)
      return ms >= fromMs && ms < toMs
    })
    .map((a) => ({ id: a.id, title: a.title, due_date: a.due_date, course_id: a.course_id }))

  const items = mergeCalendar({
    slotOccurrences,
    slotMeta,
    events: events.map((e) => ({
      id: e.id, title: e.title, event_date: e.event_date,
      start_time: e.start_time, end_time: e.end_time, course_id: e.course_id, kind: e.kind,
    })),
    assignments: dueInRange,
    anchorTz,
  })

  return NextResponse.json({ success: true, data: { items, anchorTz } })
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/integration/calendar-api.test.ts` — Expected: PASS (400 on missing range, 401 on inactive, merge has all three sources, slot expanded to the correct IST instant, range threaded to the reads).

- [ ] **Step 5: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/api/calendar" tests/integration/calendar-api.test.ts
git commit -m "feat: calendar GET API merging slots + events + deadlines (RLS-scoped)"
```

---

## Task 5.6: `/calendar` UI — FullCalendar month⇄week in the device timezone

> Spec §6/§7.6/§8: FullCalendar with a **month (`dayGridMonth`) ⇄ week (`timeGridWeek`) toggle**, rendering every item in the **viewer's device timezone** (auto-detected) with a TZ label to avoid ambiguity. The server shell loads the profile; the client view fetches `/api/calendar?from&to` per the visible range and feeds FullCalendar, which is given an explicit `timeZone` so absolute instants render in the device zone.

**Files:**
- Create: `app/(app)/calendar/page.tsx`, `app/(app)/calendar/CalendarView.tsx`
- Modify: `package.json` (FullCalendar deps)

- [ ] **Step 1: Install FullCalendar**

Run:
```bash
npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
```
Expected: added to `dependencies`.

- [ ] **Step 2: Server shell (role gate + render the client view)** — `app/(app)/calendar/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { CalendarView } from './CalendarView'

export default async function CalendarPage() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')

  const canManage = profile.role === 'teacher' || profile.role === 'admin'

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Calendar</h1>
      <CalendarView canManage={canManage} />
    </main>
  )
}
```

- [ ] **Step 3: Client view (FullCalendar month⇄week + device TZ label)** — `app/(app)/calendar/CalendarView.tsx`

```tsx
'use client'
import { useCallback, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventInput } from '@fullcalendar/core'

type CalendarItem = {
  id: string; source: 'slot' | 'event' | 'assignment'
  title: string; start: string; end: string | null; allDay: boolean
  courseId: string | null; kind: string; location?: string | null
}

const COLORS: Record<string, string> = {
  slot: '#2563eb',        // blue — timetable class
  event: '#16a34a',       // green — events/holidays
  assignment: '#dc2626',  // red — deadlines
}

export function CalendarView({ canManage }: { canManage: boolean }) {
  // The viewer's auto-detected device timezone (spec §8).
  const deviceTz = useMemo(
    () => (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'),
    [],
  )
  const [error, setError] = useState<string | null>(null)
  const calRef = useRef<FullCalendar | null>(null)

  // FullCalendar calls this with the currently visible range; we fetch + map to its events.
  const fetchEvents = useCallback(
    async (info: { startStr: string; endStr: string }): Promise<EventInput[]> => {
      const from = info.startStr.slice(0, 10)
      const to = info.endStr.slice(0, 10)
      const res = await fetch(`/api/calendar?from=${from}&to=${to}`)
      const json = await res.json()
      if (!json.success) {
        setError(json.error ?? 'Failed to load calendar')
        return []
      }
      setError(null)
      return (json.data.items as CalendarItem[]).map((i) => ({
        id: i.id,
        title: i.title,
        start: i.start,
        end: i.end ?? undefined,
        allDay: i.allDay,
        backgroundColor: COLORS[i.source],
        borderColor: COLORS[i.source],
        extendedProps: { source: i.source, kind: i.kind, courseId: i.courseId },
      }))
    },
    [],
  )

  return (
    <section className="mt-4">
      <p className="mb-2 text-xs text-slate-500" data-tz={deviceTz}>
        All times shown in your timezone: <span className="font-medium">{deviceTz}</span>
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="rounded-xl border bg-white p-2 shadow-sm">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          timeZone={deviceTz}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek',
          }}
          buttonText={{ dayGridMonth: 'Month', timeGridWeek: 'Week', today: 'Today' }}
          height="auto"
          events={fetchEvents}
        />
      </div>
    </section>
  )
}
```

> FullCalendar is given `timeZone={deviceTz}`, so the absolute UTC instants from the API are rendered in the viewer's device zone; the visible `prev/next` range drives `fetchEvents`, which re-queries `/api/calendar` so month and week views each load exactly their window. The TZ label (`data-tz`) makes the active zone explicit per §8. The `canManage` prop is consumed by Task 5.7 (management panel mounted alongside this view).

- [ ] **Step 4: Manual verify** — `npm run dev`, sign in as the seeded admin, seed one slot + one event + one assignment (or rely on Task 5.7's manager), visit `/calendar`. Expected: month view shows colored items; the Month/Week toggle switches `dayGridMonth`⇄`timeGridWeek`; the TZ label shows your device zone; switching your OS timezone and reloading shifts the displayed times but not the underlying day for a far-from-midnight slot.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/calendar/page.tsx" "app/(app)/calendar/CalendarView.tsx" package.json package-lock.json
git commit -m "feat: /calendar FullCalendar month/week view in device timezone"
```

---

## Task 5.7: Teacher/admin timetable + event management (scoped)

> Spec §5.1/§7.6: teachers create/update timetable slots & calendar events for their **assigned** courses; admin for all. This adds the management API routes (server-guarded by role + `teachesCourse`) and a client panel surfaced on `/calendar` when `canManage`.

**Files:**
- Create: `app/api/timetable/route.ts`, `app/api/timetable/[id]/route.ts`, `app/api/events/route.ts`, `app/api/events/[id]/route.ts`, `app/(app)/calendar/TimetableManager.tsx`
- Modify: `app/(app)/calendar/page.tsx` (mount the manager when `canManage`)
- Test: `tests/integration/timetable-api.test.ts`

- [ ] **Step 1: Write the failing API integration test** (teacher-of-course scope is the key assertion; repos mocked)

```ts
// tests/integration/timetable-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
vi.mock('@/lib/auth/profile', () => ({ getProfile: vi.fn(async () => profile) }))

const teaches = vi.fn(async (_courseId: string) => true)
vi.mock('@/lib/auth/courseScope', () => ({ teachesCourse: (...a: any[]) => teaches(...a) }))

const created = { id: 'slot-1', course_id: 'c-1', subject: 'Maths', day_of_week: 1, start_time: '09:00', end_time: '10:00' }
const createSlot = vi.fn(async () => created)
const listSlots = vi.fn(async () => [created])
vi.mock('@/lib/repos/timetableSlots', () => ({
  createSlot: (...a: any[]) => createSlot(...a),
  listSlots: (...a: any[]) => listSlots(...a),
}))

import { GET, POST } from '@/app/api/timetable/route'

const body = (o: any) => new Request('http://t/api/timetable', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o),
})
const valid = { course_id: 'c-1', subject: 'Maths', day_of_week: 1, start_time: '09:00', end_time: '10:00' }

beforeEach(() => { profile.role = 'teacher'; profile.status = 'active'; teaches.mockResolvedValue(true) })

describe('POST /api/timetable', () => {
  it('teacher who teaches the course can create a slot', async () => {
    const res = await POST(body(valid))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(createSlot).toHaveBeenCalled()
  })

  it('teacher who does NOT teach the course is forbidden', async () => {
    teaches.mockResolvedValue(false)
    const res = await POST(body({ ...valid, course_id: 'c-other' }))
    expect(res.status).toBe(403)
    expect(createSlot).not.toHaveBeenCalled()
  })

  it('a student is forbidden from creating a slot', async () => {
    profile.role = 'student'
    const res = await POST(body(valid))
    expect(res.status).toBe(403)
    expect(createSlot).not.toHaveBeenCalled()
  })

  it('rejects an invalid slot with 400 (end before start)', async () => {
    const res = await POST(body({ ...valid, start_time: '10:00', end_time: '09:00' }))
    expect(res.status).toBe(400)
    expect(createSlot).not.toHaveBeenCalled()
  })
})

describe('GET /api/timetable', () => {
  it('returns the RLS-scoped slot list', async () => {
    const res = await GET(new Request('http://t/api/timetable'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/integration/timetable-api.test.ts` — Expected: FAIL (no route module).

- [ ] **Step 3: Implement** — `app/api/timetable/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { teachesCourse } from '@/lib/auth/courseScope'
import { createSlotSchema } from '@/lib/validation/timetableSlot'
import { createSlot, listSlots } from '@/lib/repos/timetableSlots'

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function GET(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  const url = new URL(request.url)
  const courseId = url.searchParams.get('courseId') ?? undefined
  const data = await listSlots({ courseId, activeOnly: false }) // RLS scopes the rows
  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  if (profile.role !== 'teacher' && profile.role !== 'admin') return fail('forbidden', 403)

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = createSlotSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  if (profile.role === 'teacher' && !(await teachesCourse(parsed.data.course_id))) {
    return fail('forbidden', 403)
  }

  const slot = await createSlot(parsed.data)
  return NextResponse.json({ success: true, data: slot }, { status: 201 })
}
```

- [ ] **Step 4: Implement** — `app/api/timetable/[id]/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { teachesCourse } from '@/lib/auth/courseScope'
import { updateSlotSchema } from '@/lib/validation/timetableSlot'
import { getSlot, updateSlot, deactivateSlot } from '@/lib/repos/timetableSlots'

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
  const existing = await getSlot(id)
  if (!existing) return fail('not-found', 404)
  const auth = await authorizeWrite(existing.course_id)
  if (!auth.ok) return auth.res

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = updateSlotSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  const updated = await updateSlot(id, parsed.data)
  return NextResponse.json({ success: true, data: updated })
}

// deactivate = soft-delete (the slot stops expanding into occurrences)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await getSlot(id)
  if (!existing) return fail('not-found', 404)
  const auth = await authorizeWrite(existing.course_id)
  if (!auth.ok) return auth.res
  const deactivated = await deactivateSlot(id)
  return NextResponse.json({ success: true, data: deactivated })
}
```

- [ ] **Step 5: Implement** — `app/api/events/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { teachesCourse } from '@/lib/auth/courseScope'
import { createEventSchema } from '@/lib/validation/calendarEvent'
import { createEvent, listEvents } from '@/lib/repos/calendarEvents'

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function GET(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  const data = await listEvents({ from, to }) // RLS scopes the rows
  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  if (profile.role !== 'teacher' && profile.role !== 'admin') return fail('forbidden', 403)

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = createEventSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  // Global events (course_id null) are admin-only; teachers may only create course events they teach.
  if (profile.role === 'teacher') {
    if (parsed.data.course_id == null) return fail('forbidden', 403)
    if (!(await teachesCourse(parsed.data.course_id))) return fail('forbidden', 403)
  }

  const event = await createEvent(parsed.data, profile.id)
  return NextResponse.json({ success: true, data: event }, { status: 201 })
}
```

- [ ] **Step 6: Implement** — `app/api/events/[id]/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { teachesCourse } from '@/lib/auth/courseScope'
import { updateEventSchema } from '@/lib/validation/calendarEvent'
import { getEvent, updateEvent, deleteEvent } from '@/lib/repos/calendarEvents'

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

// A teacher may write a course event they teach; global events (course_id null) are admin-only.
async function authorizeEventWrite(courseId: string | null) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return { ok: false as const, res: fail('no-access', 401) }
  if (profile.role === 'admin') return { ok: true as const, profile }
  if (profile.role !== 'teacher') return { ok: false as const, res: fail('forbidden', 403) }
  if (courseId == null) return { ok: false as const, res: fail('forbidden', 403) }
  if (!(await teachesCourse(courseId))) return { ok: false as const, res: fail('forbidden', 403) }
  return { ok: true as const, profile }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await getEvent(id)
  if (!existing) return fail('not-found', 404)
  const auth = await authorizeEventWrite(existing.course_id)
  if (!auth.ok) return auth.res

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = updateEventSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  const updated = await updateEvent(id, parsed.data)
  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await getEvent(id)
  if (!existing) return fail('not-found', 404)
  const auth = await authorizeEventWrite(existing.course_id)
  if (!auth.ok) return auth.res
  await deleteEvent(id)
  return NextResponse.json({ success: true, data: { id } })
}
```

- [ ] **Step 7: Run — must pass** — Run: `npm run test -- tests/integration/timetable-api.test.ts` — Expected: PASS (create allowed for teacher-of-course; 403 for other-course teacher and for student; 400 on end-before-start; GET returns scoped list).

- [ ] **Step 8: Implement the management panel (client)** — `app/(app)/calendar/TimetableManager.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const KINDS = ['event', 'holiday', 'cancellation', 'reschedule'] as const

export function TimetableManager() {
  const router = useRouter()
  const [tab, setTab] = useState<'slot' | 'event'>('slot')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // slot fields
  const [courseId, setCourseId] = useState('')
  const [subject, setSubject] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [location, setLocation] = useState('')

  // event fields
  const [evTitle, setEvTitle] = useState('')
  const [evDate, setEvDate] = useState('')
  const [evCourseId, setEvCourseId] = useState('')
  const [evKind, setEvKind] = useState<(typeof KINDS)[number]>('event')

  const post = async (path: string, payload: unknown) => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(path, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'failed')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  const submitSlot = (e: React.FormEvent) => {
    e.preventDefault()
    void post('/api/timetable', {
      course_id: courseId, subject, day_of_week: dayOfWeek,
      start_time: startTime, end_time: endTime,
      mode_or_location: location || undefined,
    })
  }
  const submitEvent = (e: React.FormEvent) => {
    e.preventDefault()
    void post('/api/events', {
      title: evTitle, event_date: evDate, kind: evKind,
      course_id: evCourseId || null,
    })
  }

  return (
    <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex gap-2">
        <button onClick={() => setTab('slot')}
          className={`rounded px-3 py-1 text-sm ${tab === 'slot' ? 'bg-slate-900 text-white' : 'border'}`}>
          Weekly slot
        </button>
        <button onClick={() => setTab('event')}
          className={`rounded px-3 py-1 text-sm ${tab === 'event' ? 'bg-slate-900 text-white' : 'border'}`}>
          Event
        </button>
      </div>

      {tab === 'slot' ? (
        <form onSubmit={submitSlot} className="grid gap-2 sm:grid-cols-2">
          <input className="rounded border p-2" placeholder="Course ID" value={courseId}
            onChange={(e) => setCourseId(e.target.value)} required />
          <input className="rounded border p-2" placeholder="Subject" value={subject}
            onChange={(e) => setSubject(e.target.value)} required />
          <label className="text-sm">Day
            <select className="mt-1 w-full rounded border p-2" value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <input className="rounded border p-2" placeholder="Room / mode" value={location}
            onChange={(e) => setLocation(e.target.value)} />
          <label className="text-sm">Start (institute time)
            <input type="time" className="mt-1 w-full rounded border p-2" value={startTime}
              onChange={(e) => setStartTime(e.target.value)} required />
          </label>
          <label className="text-sm">End (institute time)
            <input type="time" className="mt-1 w-full rounded border p-2" value={endTime}
              onChange={(e) => setEndTime(e.target.value)} required />
          </label>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <button type="submit" disabled={busy}
            className="rounded-lg border px-4 py-2 font-medium shadow-sm disabled:opacity-50 sm:col-span-2">
            {busy ? 'Saving…' : 'Add weekly slot'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitEvent} className="grid gap-2 sm:grid-cols-2">
          <input className="rounded border p-2" placeholder="Title" value={evTitle}
            onChange={(e) => setEvTitle(e.target.value)} required />
          <input type="date" className="rounded border p-2" value={evDate}
            onChange={(e) => setEvDate(e.target.value)} required />
          <input className="rounded border p-2" placeholder="Course ID (blank = global, admin only)"
            value={evCourseId} onChange={(e) => setEvCourseId(e.target.value)} />
          <label className="text-sm">Kind
            <select className="mt-1 w-full rounded border p-2" value={evKind}
              onChange={(e) => setEvKind(e.target.value as (typeof KINDS)[number])}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <button type="submit" disabled={busy}
            className="rounded-lg border px-4 py-2 font-medium shadow-sm disabled:opacity-50 sm:col-span-2">
            {busy ? 'Saving…' : 'Add event'}
          </button>
        </form>
      )}
    </section>
  )
}
```

- [ ] **Step 9: Mount the manager on `/calendar` when `canManage`** — edit `app/(app)/calendar/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { CalendarView } from './CalendarView'
import { TimetableManager } from './TimetableManager'

export default async function CalendarPage() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')

  const canManage = profile.role === 'teacher' || profile.role === 'admin'

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Calendar</h1>
      <CalendarView canManage={canManage} />
      {canManage && <TimetableManager />}
    </main>
  )
}
```

- [ ] **Step 10: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add "app/api/timetable" "app/api/events" "app/(app)/calendar/TimetableManager.tsx" "app/(app)/calendar/page.tsx" tests/integration/timetable-api.test.ts
git commit -m "feat: teacher/admin timetable + event management (scoped)"
```

---

## Task 5.8: Playwright E2E — admin creates a weekly slot → student sees it in week & month, in device TZ

> Spec §10 E2E: admin creates a weekly slot for a course; an enrolled student sees it in **both** week and month views with times shown in the **browser's device timezone**. Drives the real UI through the management panel and FullCalendar.

**Files:**
- Create: `e2e/calendar.spec.ts`
- (Reuses `playwright.config.ts` + per-role `storageState` auth fixtures from earlier phases; create the config only if missing — see Phase 3 Task 3.7.)

- [ ] **Step 1: Ensure Playwright is set up** — if `playwright.config.ts` is missing, follow Phase 3 Task 3.7 Step 1 to install `@playwright/test`, add `"test:e2e": "playwright test"`, and create the config. Expected: `npm run test:e2e -- --list` runs.

- [ ] **Step 2: Write the E2E spec**

```ts
// e2e/calendar.spec.ts
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Seeds run against the PREVIEW Supabase project via service-role (E2E_* envs).
const sb = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!)

const COURSE = 'E2E Calendar Course'
let courseId = ''
let teacherId = ''
let studentId = ''

// Auth via per-role storageState files produced by the Phase 0/1 E2E login setup:
//   e2e/.auth/admin.json, e2e/.auth/student.json

// Pick a fixed UPCOMING weekday so the slot is guaranteed to fall on a visible Monday.
// We force the calendar to a known month/week by navigating to a target date.
function nextMondayIso(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  const delta = (8 - d.getUTCDay()) % 7 || 7 // next Monday (>=1 day ahead)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}
const targetMonday = nextMondayIso()

test.beforeAll(async () => {
  const { data: c } = await sb.from('courses').insert({ name: COURSE, status: 'active' }).select('id').single()
  courseId = c!.id
  teacherId = (await sb.from('profiles').select('id').eq('email', process.env.E2E_ADMIN_EMAIL!).single()).data!.id
  studentId = (await sb.from('profiles').select('id').eq('email', process.env.E2E_STUDENT_EMAIL!).single()).data!.id
  await sb.from('enrollments').insert({ student_id: studentId, course_id: courseId })
})

test.afterAll(async () => {
  await sb.from('timetable_slots').delete().eq('course_id', courseId)
  await sb.from('enrollments').delete().eq('course_id', courseId)
  await sb.from('courses').delete().eq('id', courseId)
})

test.describe('admin creates a weekly slot → enrolled student sees it in week & month', () => {
  test('slot is visible in both views, in the device timezone', async ({ browser }) => {
    // 1) Admin creates a Monday 09:00–10:00 slot for the course via the manager UI.
    const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' })
    const aPage = await admin.newPage()
    await aPage.goto('/calendar')
    await aPage.getByRole('button', { name: 'Weekly slot' }).click()
    await aPage.getByPlaceholder('Course ID').fill(courseId)
    await aPage.getByPlaceholder('Subject').fill('E2E Maths')
    await aPage.getByLabel('Day').selectOption('1') // Monday
    await aPage.getByLabel('Start (institute time)').fill('09:00')
    await aPage.getByLabel('End (institute time)').fill('10:00')
    await aPage.getByRole('button', { name: /Add weekly slot/ }).click()
    // confirm the row landed in the DB (deterministic wait)
    await expect.poll(async () =>
      (await sb.from('timetable_slots').select('id').eq('course_id', courseId)).data?.length ?? 0,
    ).toBeGreaterThan(0)

    // 2) Enrolled student opens the calendar.
    const student = await browser.newContext({
      storageState: 'e2e/.auth/student.json',
      timezoneId: 'Asia/Kolkata', // pin a device TZ so the assertion is deterministic
    })
    const sPage = await student.newPage()
    await sPage.goto('/calendar')

    // device-TZ label is shown (spec §8)
    await expect(sPage.locator('[data-tz="Asia/Kolkata"]')).toBeVisible()

    // 3) MONTH view: navigate to the target Monday's month and see the slot.
    await sPage.getByRole('button', { name: 'Month' }).click()
    // step forward until the target month/day cell is visible (bounded)
    for (let i = 0; i < 3; i++) {
      if (await sPage.getByText('E2E Maths').first().isVisible().catch(() => false)) break
      await sPage.getByRole('button', { name: 'next' }).click()
    }
    await expect(sPage.getByText('E2E Maths').first()).toBeVisible()

    // 4) WEEK view: switch and confirm the slot still appears (timed event).
    await sPage.getByRole('button', { name: 'Week' }).click()
    for (let i = 0; i < 6; i++) {
      if (await sPage.getByText('E2E Maths').first().isVisible().catch(() => false)) break
      await sPage.getByRole('button', { name: 'next' }).click()
    }
    await expect(sPage.getByText('E2E Maths').first()).toBeVisible()

    await admin.close(); await student.close()
  })
})
```

- [ ] **Step 3: Run the E2E suite**

Run: `npm run test:e2e -- e2e/calendar.spec.ts`
Expected: PASS — admin creates the weekly slot; the enrolled student sees `E2E Maths` in **both** the month (`dayGridMonth`) and week (`timeGridWeek`) views, and the device-TZ label (`Asia/Kolkata`) is shown.

> The student context is pinned to `Asia/Kolkata` so the 09:00 institute (IST) slot renders at 09:00 for the viewer and the assertion is deterministic. Pinning a different `timezoneId` (e.g. `UTC`) would shift the displayed time to 03:30 but keep the same Monday — demonstrating device-TZ display over a TZ-independent instant.

- [ ] **Step 4: Commit**

```bash
git add e2e/calendar.spec.ts
git commit -m "test: e2e admin slot → student sees it in week & month (device TZ)"
```

---

## Phase 5 Acceptance Criteria
- [ ] `npm run test` green: `expandSlots` (IST exactness, NY summer/winter DST offsets, multi-week expansion, cross-TZ formatting, empty + invalid range), `timetableSlot`/`calendarEvent` Zod validators, `mergeCalendar` (all three sources represented, all-day vs timed, anchor-TZ event instants, source-prefixed ids), `calendar-api` (range required, inactive blocked, merge composition + IST instant + range threading), `timetable-api` (teacher-of-course scope guard).
- [ ] Integration (env-file runner) green: `rls-calendar` (anon blocked on both tables, tables + RLS exist, column shapes match spec §5).
- [ ] `timetable_slots` + `calendar_events` exist with **RLS enabled**: reads scoped to enrolled student / teacher-of-course / admin, plus global events (`course_id` null) visible to every active user; writes restricted to teacher-of-course (course events only) or admin (any, incl. global).
- [ ] Recurring slot times are stored as wall-clock anchored to `org_settings.timezone` and expanded to **absolute UTC instants** per occurrence; the expansion is DST-safe (verified against an IST no-DST zone and a NY DST zone in summer and winter).
- [ ] `GET /api/calendar?from&to` returns a unified list with every source (`slot`, `event`, `assignment`) represented and scoped to the requester via RLS; the response echoes `anchorTz`.
- [ ] `/calendar` renders FullCalendar with a working **month (`dayGridMonth`) ⇄ week (`timeGridWeek`) toggle**, all times shown in the **viewer's device timezone** with an explicit TZ label; the visible range drives `/api/calendar` queries.
- [ ] Teacher/admin can create/update timetable slots & events for their assigned courses (admin: all + global); a teacher of another course and any student get 403.
- [ ] Playwright E2E green: admin creates a weekly slot → enrolled student sees it in **both** week and month views, with the device-TZ label shown.
- [ ] All API inputs validated with Zod; all responses use the `{ success, data?, error? }` envelope; no secrets in the client bundle (RLS-enforced server client for all reads; no service-role usage added in this phase).
- [ ] Committed in small steps with conventional-commit messages.

## Self-review notes (done)
- **Spec coverage:** §5 `timetable_slots` (`course_id`, `subject`, `teacher_id`, `day_of_week`, `start_time`, `end_time`, `mode_or_location`, `active`) + `calendar_events` (`title`, `description`, `event_date`, `start_time`, `end_time`, `course_id`, `kind`, `slot_id`, `created_by`) → Task 5.1 migration + Task 5.2 repos with the exact column names; §5.1 RLS table (read enrolled/teacher-of-course/admin + global events; write teacher-of-course/admin) → Task 5.1 policies + Task 5.5/5.7 server guards; §7.6 overlay of expanded slots + events + assignment deadlines → Task 5.3 `expandSlots` + Task 5.4 `mergeCalendar` + Task 5.5 API + Task 5.6 UI; §8 store-UTC/display-device-TZ + anchor-TZ recurring slots → Task 5.3 expansion to absolute instants + Task 5.6 `timeZone={deviceTz}` + TZ label.
- **Timezone correctness is genuinely two-layered:** recurring slots are wall-clock anchored to `org_settings.timezone` and `expandSlots` converts each occurrence to an absolute UTC instant *once, server-side* (DST-aware via an `Intl.DateTimeFormat` offset read + a one-step fixpoint to survive transition days); the client then formats those absolute instants in the *device* timezone via FullCalendar's `timeZone` prop. A unit test pins the same instant rendered in two device zones (`UTC` 03:30 vs `Asia/Kolkata` 09:00), proving display-TZ independence of the stored instant.
- **No new time-format file:** Task 5.5's skip note reuses Phase 3's `lib/time/format.ts` (`formatInstant`/`formatInstantDevice`); the new code lives only in `lib/time/expandSlots.ts` and `lib/calendar/merge.ts`, avoiding collisions per the brief.
- **Merge is a pure, deterministic function** over already-fetched rows (`mergeCalendar`), so the RLS-scoped fetching/expansion in the API route is separable from the mapping logic and both are independently tested; each of the three sources maps to a source-tagged, stably-id'd `CalendarItem`.
- **Authorization defense-in-depth:** RLS at the DB (the security boundary — global events readable by all active users, course rows scoped by `is_enrolled`/`teaches_course`, writes gated by `teaches_course`/`is_active_admin`) + explicit server guards (`teachesCourse` + role checks; global events admin-only) at every write endpoint, mirroring Phase 3's pattern, so a bug in one layer doesn't leak or over-permit. Admin overrides everywhere per §5.1.
- **Type consistency:** `TimetableSlot`/`CalendarEvent` row types + `CalendarEventKind` single-sourced in the repos; `CreateSlot/UpdateSlot/CreateEvent/UpdateEvent` input types in validation; `ExpandableSlot`/`SlotOccurrence` in `expandSlots.ts`; `CalendarItem`/`CalendarSource`/`MergeInput` in `merge.ts`; the `hhmm` regex schema is defined once in `timetableSlot.ts` and reused by `calendarEvent.ts`; route handlers use the same `{ success, data?, error? }` envelope as Phases 0–4.
- **Reuse:** Phase 0 `lib/supabase/{server,admin}`, `lib/auth/{profile,guards}`, `lib/repos/orgSettings`; Phase 1 SQL helpers `is_enrolled`/`teaches_course` + tables `courses`/`enrollments`/`course_teachers`; Phase 3 `lib/auth/courseScope` (`teachesCourse`/`isEnrolled`), `lib/repos/assignments` (`listAssignments`, absolute `due_date`), and `lib/time/format.ts` — all consumed unchanged via their documented signatures.
- **No placeholders:** every step has runnable code, an explicit run command, and an expected RED/GREEN outcome; commit messages are conventional and attribution-free.
- **Cross-phase assumptions recorded:** migration numbering continues at `0006_calendar.sql` (after Phase 4's `0005_finance.sql`); Phase 1 `is_enrolled`/`teaches_course` SQL helpers and `courses`/`enrollments`/`course_teachers`; Phase 3 `lib/auth/courseScope`, `lib/repos/assignments` (absolute `due_date`), `lib/time/format.ts`, and the Phase 0/1 E2E per-role `storageState` auth fixtures (`e2e/.auth/admin.json`, `e2e/.auth/student.json`) + `playwright.config.ts`. If any differ, only the noted call sites change — test contracts stay fixed.
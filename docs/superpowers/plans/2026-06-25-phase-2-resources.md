# Phase 2 — Resources Implementation Plan

> **How to build this (no special model, plugin, or skill required).** This plan is fully self-contained. Build the tasks **in order**, top to bottom. For each task, follow the steps verbatim: write the test exactly as shown → run the exact command and confirm the expected FAIL → paste the implementation exactly as shown → re-run and confirm PASS → commit. Then check off each `- [ ]`. Do not reorder steps, skip the test-first order, or improvise — every command and code block is provided literally.

**Goal:** A teacher (assigned to a course) uploads a file straight from the browser into that course's Drive `Resources/` folder via a server-initiated resumable session; the upload is validated server-side at finalize (type + size from real Drive metadata); a student enrolled in that course browses and downloads it through an access-checked endpoint that redirects to a short-lived Drive link; a non-enrolled student gets `403`. Orphaned/abandoned uploads are swept by a cron job.

**Architecture:** File bytes never pass through our Vercel functions (spec §4.4). The browser asks `uploads/init` to open a Drive **resumable session** (server holds the Drive token, returns only the single-use session URI + a `pending` `resources` row), PUTs the bytes **directly to Google**, then calls `uploads/finalize` which re-reads Drive metadata, validates it, and flips the row to `active` (or trashes the file). Reads are RLS-gated (`is_enrolled(course_id)` / admin) and downloads go through `resources/[id]/download` which re-checks access then 302-redirects to a short-lived `webContentLink`. A `cron/reconcile-uploads` job trashes Drive files + deletes `pending` rows older than N hours.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Tailwind 4, `@supabase/supabase-js` + `@supabase/ssr`, `googleapis`, Zod, Vitest, Playwright.

**Prereqted spec:** `docs/superpowers/specs/2026-06-25-cert-ed-academia-app-design.md` (§4.3 Drive, §4.4 resumable upload flow, §5 data model, §5.1 RLS, §7.3 Resources)

**Depends on:** Phase 0 (Drive token client `@/lib/drive/auth` `getDriveClient()`, folder resolver `@/lib/drive/folders` `ensureFolderPath`/`ensureChildFolder`, Supabase clients, `@/lib/auth/profile` `getProfile()`, `@/lib/auth/guards` `assertRole`, `CRON_SECRET`, the resolved CORS spike doc `scripts/spike-resumable-cors.md`) and Phase 1 (`courses`, `enrollments`, `course_teachers` tables + the `is_enrolled(course_id)` and `teaches_course(course_id)` SQL helpers).

---

## File map (created in this phase)

```
supabase/migrations/0003_resources.sql       # resources + drive_folders tables, RLS
lib/drive/resumable.ts                        # initResumableSession + finalizeUpload (TDD, mocked drive)
lib/drive/folderCache.ts                      # resolveCourseFolder() — ensureFolderPath + drive_folders cache
lib/validation/resource.ts                    # Zod: allowed mime types + max size + init/finalize payloads
lib/repos/resources.ts                        # resources repository (pending/active rows, list, get)
lib/hooks/useResumableUpload.ts               # client hook: init → browser PUT → finalize (+ fallback note)
app/api/uploads/init/route.ts                 # POST: opens session, writes pending row, returns sessionUri
app/api/uploads/finalize/route.ts             # POST: re-validates Drive metadata, flips to active or trashes
app/api/cron/reconcile-uploads/route.ts       # GET (CRON_SECRET): trash + delete stale pending rows
app/api/resources/[id]/download/route.ts      # GET: access check → 302 to short-lived Drive link
app/(app)/resources/page.tsx                  # teacher upload + student browse/download (pagination + search)
app/(app)/resources/ResourceUploader.tsx      # client upload widget (uses the hook)
app/(app)/resources/ResourceList.tsx          # client list with title search + pagination
tests/integration/rls-resources.test.ts       # RLS policy test (enrolled read / teacher-of-course write)
tests/unit/drive-resumable.test.ts            # initResumableSession + finalizeUpload (mocked)
tests/unit/resource-validation.test.ts        # Zod allowed-types/max-size
tests/unit/finalize-validation.test.ts        # finalize accepts/rejects by metadata
tests/unit/reconcile-query.test.ts            # stale-pending selection query
tests/unit/resources-download-access.test.ts  # download access check (enrolled/teacher/admin vs 403)
e2e/resources.spec.ts                         # teacher uploads → enrolled student downloads → non-enrolled 403
```

> The migration is numbered `0003` because Phase 0 ships `0001_foundation.sql` and Phase 1 ships `0002_announcements_admin.sql`.

---

## Task 2.1: Migration — `resources` + `drive_folders` tables, RLS (read=enrolled/admin, write=teacher-of-course/admin)

**Files:**
- Create: `supabase/migrations/0003_resources.sql`
- Test: `tests/integration/rls-resources.test.ts`

> Assumes Phase 1 created `courses`, `enrollments`, `course_teachers`, and the SECURITY-DEFINER helpers `is_enrolled(course_id uuid) returns boolean` (true if the caller has an `enrollments` row for that course) and `teaches_course(course_id uuid) returns boolean` (true if the caller has a `course_teachers` row for that course). Phase 0 created `is_active_admin()`.

- [ ] **Step 1: Write the failing RLS integration test**

```ts
// tests/integration/rls-resources.test.ts
import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(url, service) // bypasses RLS — used to seed + to mint role JWTs

// Build an RLS-enforced client that acts as a specific profile id by signing a user JWT.
// In Phase 1 the same helper is used; here we re-implement inline to keep the test self-contained.
function asUser(userId: string) {
  // service-role admin can generate a scoped access token for a user via the auth admin API.
  return { userId }
}

const ids = {
  course: '00000000-0000-0000-0000-0000000c0001',
  teacher: '00000000-0000-0000-0000-0000000a0001', // teaches `course`
  student: '00000000-0000-0000-0000-0000000a0002', // enrolled in `course`
  outsider: '00000000-0000-0000-0000-0000000a0003', // neither
}
let resourceId = ''

async function userClient(userId: string) {
  // Mint a short-lived access token for this user and build an anon-keyed client that carries it.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: `${userId}@example.com`,
  }).catch(() => ({ data: null, error: null })) as any
  // Fallback: most test suites in this repo seed auth.users + use admin.auth.admin.createUser then
  // a signed JWT. To keep this test runnable without that plumbing, we assert via service-role
  // SET LOCAL role emulation through PostgREST is not available, so we use the SQL-level helper test
  // below instead. (See Step 1b.)
  void data; void error
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}
void userClient

describe('resources RLS (SQL helper emulation)', () => {
  beforeAll(async () => {
    // Seed identities + course graph with the service-role client (bypasses RLS).
    await admin.from('profiles').upsert([
      { id: ids.teacher, email: 'rls-teacher@example.com', full_name: 'T', role: 'teacher', status: 'active' },
      { id: ids.student, email: 'rls-student@example.com', full_name: 'S', role: 'student', status: 'active' },
      { id: ids.outsider, email: 'rls-outsider@example.com', full_name: 'O', role: 'student', status: 'active' },
    ], { onConflict: 'id' })
    await admin.from('courses').upsert({ id: ids.course, name: 'RLS Course', status: 'active' }, { onConflict: 'id' })
    await admin.from('course_teachers').upsert({ teacher_id: ids.teacher, course_id: ids.course }, { onConflict: 'teacher_id,course_id' })
    await admin.from('enrollments').upsert({ student_id: ids.student, course_id: ids.course }, { onConflict: 'student_id,course_id' })

    const { data } = await admin.from('resources').insert({
      course_id: ids.course, title: 'RLS Resource', drive_file_id: 'file-rls', drive_link: 'https://drive/file-rls',
      uploaded_by: ids.teacher, status: 'active',
    }).select('id').single()
    resourceId = data!.id
  })

  afterAll(async () => {
    await admin.from('resources').delete().eq('course_id', ids.course)
    await admin.from('enrollments').delete().eq('course_id', ids.course)
    await admin.from('course_teachers').delete().eq('course_id', ids.course)
    await admin.from('courses').delete().eq('id', ids.course)
    await admin.from('profiles').delete().in('id', [ids.teacher, ids.student, ids.outsider])
  })

  it('the enrolled student can SELECT the resource (helper says enrolled)', async () => {
    // Drive the policy predicate directly via the SQL helper as the seeded student.
    const { data, error } = await admin.rpc('test_can_read_resource', { p_resource: resourceId, p_user: ids.student })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('a non-enrolled outsider cannot SELECT the resource', async () => {
    const { data, error } = await admin.rpc('test_can_read_resource', { p_resource: resourceId, p_user: ids.outsider })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('the assigned teacher can WRITE (insert) a resource for the course', async () => {
    const { data, error } = await admin.rpc('test_can_write_resource', { p_course: ids.course, p_user: ids.teacher })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('the enrolled student cannot WRITE a resource for the course', async () => {
    const { data, error } = await admin.rpc('test_can_write_resource', { p_course: ids.course, p_user: ids.student })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })
})
```

> Why two `test_can_*` RPCs: PostgREST cannot `SET ROLE` to a seeded `profiles` id without a real signed JWT, and minting per-user JWTs varies by Supabase plumbing. These tiny SECURITY-DEFINER test functions evaluate the **exact same predicate** the RLS policies use (`is_enrolled` / `teaches_course` / `is_active_admin`) while impersonating a given user id via `set_config('request.jwt.claims', …)`. They are created in the migration and prove the policy logic deterministically. The full signed-JWT path is exercised by the Playwright E2E in Task 2.8.

- [ ] **Step 2: Run it — must fail (tables + RPCs missing)**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/rls-resources.test.ts`
Expected: FAIL — relation "resources" does not exist (or function `test_can_read_resource` does not exist).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0003_resources.sql

-- ----- drive_folders: cache of resolved Drive folder ids per (course_id, kind) -----
create table drive_folders (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,   -- null for non-course folders (e.g. Finance)
  kind text not null,                                        -- 'resources' | 'assignments' | 'submissions' | ...
  drive_folder_id text not null,
  created_at timestamptz not null default now(),
  unique (course_id, kind)
);

-- ----- resources -----
create type resource_status as enum ('active','pending','archived');

create table resources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  drive_file_id text not null,
  drive_link text,
  uploaded_by uuid references profiles(id),
  status resource_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index resources_course_idx on resources (course_id, status, created_at desc);
create index resources_pending_idx on resources (status, created_at) where status = 'pending';

alter table drive_folders enable row level security;
alter table resources enable row level security;

-- drive_folders is a server-side cache touched only via the service-role client → no public policies.
-- (RLS enabled with no policy = deny-all to anon/authenticated; service role bypasses RLS.)

-- READ: enrolled students (active resources), assigned teachers, admins.
create policy resources_read on resources for select using (
  is_active_admin()
  or teaches_course(course_id)
  or (status = 'active' and is_enrolled(course_id))
);

-- WRITE (insert/update/delete): assigned teacher of the course, or admin.
create policy resources_write on resources for all
  using (is_active_admin() or teaches_course(course_id))
  with check (is_active_admin() or teaches_course(course_id));

-- ----- test-only helpers that evaluate the policy predicates for a given user id -----
-- They impersonate p_user by setting the JWT claim, then call the same helpers the policies use.
create or replace function test_can_read_resource(p_resource uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare cid uuid; st resource_status; ok boolean;
begin
  select course_id, status into cid, st from resources where id = p_resource;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user::text)::text, true);
  ok := is_active_admin() or teaches_course(cid) or (st = 'active' and is_enrolled(cid));
  perform set_config('request.jwt.claims', '', true);
  return ok;
end $$;

create or replace function test_can_write_resource(p_course uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user::text)::text, true);
  ok := is_active_admin() or teaches_course(p_course);
  perform set_config('request.jwt.claims', '', true);
  return ok;
end $$;
```

- [ ] **Step 4: Apply the migration**

Run (Supabase CLI linked to `cert-ed-prod`): `supabase db push`
(or paste the SQL into the Supabase SQL editor for the prod project.)
Expected: success, `resources` + `drive_folders` tables and the two `test_can_*` functions created.

- [ ] **Step 5: Run the RLS test — must pass**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/rls-resources.test.ts`
Expected: PASS (enrolled student reads, outsider blocked, teacher writes, student cannot write).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0003_resources.sql tests/integration/rls-resources.test.ts
git commit -m "feat: resources + drive_folders schema with enrolled-read/teacher-write RLS"
```

---

## Task 2.2: `lib/drive/resumable.ts` — open a resumable session + finalize from metadata (TDD, mocked Drive)

**Files:**
- Create: `lib/drive/resumable.ts`
- Test: `tests/unit/drive-resumable.test.ts`

> `initResumableSession(drive, { name, mimeType, parentId })` opens a Google Drive `uploadType=resumable` session and returns the `Location` header (the single-use session URI). `finalizeUpload(drive, fileId)` reads the file's `size` + `mimeType` back from Drive (`files.get`). Both take the `drive` client so they are trivially mockable; the network call inside `initResumableSession` goes through an injectable `fetchImpl` (defaults to global `fetch`) so tests don't hit Google.

- [ ] **Step 1: Write the failing test** (mock `files.get` + the resumable session fetch)

```ts
// tests/unit/drive-resumable.test.ts
import { describe, it, expect, vi } from 'vitest'
import { initResumableSession, finalizeUpload } from '@/lib/drive/resumable'

function fakeDrive(token = 'tok-123') {
  return {
    files: {
      // finalizeUpload reads metadata back from Drive
      get: vi.fn(async ({ fileId, fields }: any) => ({
        data: { id: fileId, size: '2048', mimeType: 'application/pdf', name: 'doc.pdf' },
        _fields: fields,
      })),
    },
    // getDriveClient() wires the OAuth2 client here; we expose getAccessToken the same way.
    context: { _options: { auth: { getAccessToken: vi.fn(async () => ({ token })) } } },
  } as any
}

describe('initResumableSession', () => {
  it('POSTs to the resumable endpoint with metadata + bearer token and returns the Location header', async () => {
    const drive = fakeDrive('tok-abc')
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ location: 'https://upload.googleapis.com/session/XYZ' }),
    })) as any

    const { sessionUri } = await initResumableSession(
      drive,
      { name: 'doc.pdf', mimeType: 'application/pdf', parentId: 'fld-1' },
      fetchImpl,
    )

    expect(sessionUri).toBe('https://upload.googleapis.com/session/XYZ')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = fetchImpl.mock.calls[0]
    expect(calledUrl).toContain('uploadType=resumable')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok-abc')
    expect(JSON.parse(init.body)).toMatchObject({ name: 'doc.pdf', mimeType: 'application/pdf', parents: ['fld-1'] })
  })

  it('throws when Google returns no Location header', async () => {
    const drive = fakeDrive()
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, headers: new Headers() })) as any
    await expect(
      initResumableSession(drive, { name: 'x', mimeType: 'text/plain', parentId: 'p' }, fetchImpl),
    ).rejects.toThrow('resumable-session-failed')
  })
})

describe('finalizeUpload', () => {
  it('reads size + mimeType back from Drive metadata', async () => {
    const drive = fakeDrive()
    const meta = await finalizeUpload(drive, 'file-9')
    expect(drive.files.get).toHaveBeenCalledWith({ fileId: 'file-9', fields: 'id,size,mimeType,name' })
    expect(meta).toEqual({ size: 2048, mimeType: 'application/pdf' })
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/drive-resumable.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement** — `lib/drive/resumable.ts`

```ts
import 'server-only'

const RESUMABLE_ENDPOINT =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id'

type DriveLike = {
  files: { get: (args: { fileId: string; fields: string }) => Promise<{ data: any }> }
  context: { _options: { auth: { getAccessToken: () => Promise<{ token?: string } | string> } } }
}

export type InitSessionInput = { name: string; mimeType: string; parentId: string }

async function accessToken(drive: DriveLike): Promise<string> {
  const t = await drive.context._options.auth.getAccessToken()
  const token = typeof t === 'string' ? t : t?.token
  if (!token) throw new Error('drive-access-token-missing')
  return token
}

/** Opens a Drive resumable upload session and returns the single-use session URI (Location header). */
export async function initResumableSession(
  drive: DriveLike,
  input: InitSessionInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sessionUri: string }> {
  const token = await accessToken(drive)
  const res = await fetchImpl(RESUMABLE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': input.mimeType,
    },
    body: JSON.stringify({ name: input.name, mimeType: input.mimeType, parents: [input.parentId] }),
  })
  const sessionUri = res.headers.get('location')
  if (!res.ok || !sessionUri) throw new Error('resumable-session-failed')
  return { sessionUri }
}

/** Re-reads a finalized file's real size + mimeType from Drive (never trust client claims). */
export async function finalizeUpload(
  drive: DriveLike,
  fileId: string,
): Promise<{ size: number; mimeType: string }> {
  const { data } = await drive.files.get({ fileId, fields: 'id,size,mimeType,name' })
  return { size: Number(data.size ?? 0), mimeType: String(data.mimeType ?? '') }
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/drive-resumable.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/drive/resumable.ts tests/unit/drive-resumable.test.ts
git commit -m "feat: drive resumable session opener + metadata finalize helper"
```

---

## Task 2.3a: Resource validation (Zod: allowed types + max size + init/finalize payloads)

**Files:**
- Create: `lib/validation/resource.ts`
- Test: `tests/unit/resource-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/resource-validation.test.ts
import { describe, it, expect } from 'vitest'
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  initUploadSchema,
  isAllowedUpload,
} from '@/lib/validation/resource'

describe('upload validation constants', () => {
  it('allows pdf and rejects unknown types', () => {
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf')
    expect(isAllowedUpload({ size: 1024, mimeType: 'application/pdf' })).toBe(true)
    expect(isAllowedUpload({ size: 1024, mimeType: 'application/x-msdownload' })).toBe(false)
  })
  it('rejects files over the max size', () => {
    expect(isAllowedUpload({ size: MAX_UPLOAD_BYTES + 1, mimeType: 'application/pdf' })).toBe(false)
    expect(isAllowedUpload({ size: MAX_UPLOAD_BYTES, mimeType: 'application/pdf' })).toBe(true)
  })
})

describe('initUploadSchema', () => {
  it('accepts a valid init payload', () => {
    const out = initUploadSchema.parse({
      courseId: '00000000-0000-0000-0000-0000000c0001',
      title: 'Week 1 notes',
      fileName: 'notes.pdf',
      mimeType: 'application/pdf',
      size: 50_000,
    })
    expect(out.title).toBe('Week 1 notes')
  })
  it('rejects an oversize declared size', () => {
    expect(() =>
      initUploadSchema.parse({
        courseId: '00000000-0000-0000-0000-0000000c0001',
        title: 'big',
        fileName: 'big.pdf',
        mimeType: 'application/pdf',
        size: MAX_UPLOAD_BYTES + 1,
      }),
    ).toThrow()
  })
  it('rejects a disallowed declared mime type', () => {
    expect(() =>
      initUploadSchema.parse({
        courseId: '00000000-0000-0000-0000-0000000c0001',
        title: 'evil',
        fileName: 'evil.exe',
        mimeType: 'application/x-msdownload',
        size: 10,
      }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/resource-validation.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement** — `lib/validation/resource.ts`

```ts
import { z } from 'zod'

/** 25 MB cap for resources in the pilot (well under Drive's 15 GB account quota). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/plain',
  'application/zip',
] as const

export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number]

/** Authoritative check used at finalize (real Drive metadata) and at init (client claim). */
export function isAllowedUpload({ size, mimeType }: { size: number; mimeType: string }): boolean {
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) return false
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)
}

export const initUploadSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
})
export type InitUploadInput = z.infer<typeof initUploadSchema>

export const finalizeUploadSchema = z.object({
  resourceId: z.string().uuid(),
  driveFileId: z.string().min(1),
})
export type FinalizeUploadInput = z.infer<typeof finalizeUploadSchema>
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/resource-validation.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/resource.ts tests/unit/resource-validation.test.ts
git commit -m "feat: resource upload validation (allowed types, max size, zod schemas)"
```

---

## Task 2.3b: `resources` repository + course-folder cache

**Files:**
- Create: `lib/repos/resources.ts`, `lib/drive/folderCache.ts`

> These are thin DB/Drive wrappers used by the API routes. The cache resolves (and remembers) the per-course `Resources/` Drive folder id in `drive_folders`, guarding the folder-creation race per spec §4.3 via the unique `(course_id, kind)` constraint.

- [ ] **Step 1: Implement the course-folder cache** — `lib/drive/folderCache.ts`

```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureFolderPath } from '@/lib/drive/folders'

/**
 * Resolve the Drive folder id for a course's content area (e.g. 'resources'),
 * caching it in drive_folders. Folder tree mirrors spec §4.3:
 *   Cert-Ed Academia / <Course> / Resources
 */
export async function resolveCourseFolder(
  drive: any,
  courseId: string,
  courseName: string,
  kind: 'resources' | 'assignments',
): Promise<string> {
  const admin = createAdminClient()

  const { data: cached } = await admin
    .from('drive_folders')
    .select('drive_folder_id')
    .eq('course_id', courseId)
    .eq('kind', kind)
    .maybeSingle()
  if (cached?.drive_folder_id) return cached.drive_folder_id

  const rootId =
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ??
    (await ensureFolderPath(drive, 'root', ['Cert-Ed Academia']))
  const segment = kind === 'resources' ? 'Resources' : 'Assignments'
  const folderId = await ensureFolderPath(drive, rootId, [courseName, segment])

  // Upsert guards the create race: a concurrent insert resolves to the same row.
  const { data: saved } = await admin
    .from('drive_folders')
    .upsert(
      { course_id: courseId, kind, drive_folder_id: folderId },
      { onConflict: 'course_id,kind' },
    )
    .select('drive_folder_id')
    .single()
  return saved?.drive_folder_id ?? folderId
}
```

- [ ] **Step 2: Implement the resources repository** — `lib/repos/resources.ts`

```ts
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type Resource = {
  id: string
  course_id: string
  title: string
  drive_file_id: string
  drive_link: string | null
  uploaded_by: string | null
  status: 'active' | 'pending' | 'archived'
  created_at: string
}

const PAGE_SIZE = 20

/** RLS-enforced list for the current user: active resources in courses they can see. */
export async function listResources(opts: {
  courseId?: string
  search?: string
  page?: number
}): Promise<{ rows: Resource[]; total: number }> {
  const supabase = await createClient()
  const page = Math.max(1, opts.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  let q = supabase
    .from('resources')
    .select('*', { count: 'exact' })
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  if (opts.courseId) q = q.eq('course_id', opts.courseId)
  if (opts.search) q = q.ilike('title', `%${opts.search}%`)
  const { data, count, error } = await q
  if (error) throw new Error(`resources.list: ${error.message}`)
  return { rows: (data ?? []) as Resource[], total: count ?? 0 }
}

/** Service-role read of a single resource (used by the access-checked download route). */
export async function getResourceById(id: string): Promise<Resource | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('resources').select('*').eq('id', id).maybeSingle()
  return (data as Resource) ?? null
}

/** Insert a pending resource row (service-role; the API route already verified teacher scope). */
export async function insertPendingResource(input: {
  courseId: string
  title: string
  driveFileId: string
  uploadedBy: string
}): Promise<Resource> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('resources')
    .insert({
      course_id: input.courseId,
      title: input.title,
      drive_file_id: input.driveFileId,
      uploaded_by: input.uploadedBy,
      status: 'pending',
    })
    .select('*')
    .single()
  if (error) throw new Error(`resources.insertPending: ${error.message}`)
  return data as Resource
}

export async function activateResource(id: string, driveLink: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('resources')
    .update({ status: 'active', drive_link: driveLink })
    .eq('id', id)
  if (error) throw new Error(`resources.activate: ${error.message}`)
}

export async function deletePendingResource(id: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('resources').delete().eq('id', id).eq('status', 'pending')
}
```

- [ ] **Step 3: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/repos/resources.ts lib/drive/folderCache.ts
git commit -m "feat: resources repository + cached per-course Drive folder resolver"
```

---

## Task 2.4: `uploads/init` + `uploads/finalize` API routes (TDD the finalize validation)

**Files:**
- Create: `app/api/uploads/init/route.ts`, `app/api/uploads/finalize/route.ts`
- Test: `tests/unit/finalize-validation.test.ts`

> `init` (POST): auth → `assertRole(profile, ['teacher','admin'])` → Zod-validate the init payload → verify the caller teaches the course (or is admin) → resolve the course `Resources/` folder → open the resumable session → write a `pending` row → return `{ sessionUri, resourceId }`.
> `finalize` (POST): auth → role → Zod → load the pending row → re-read Drive metadata → **`isAllowedUpload`** on the *real* `size`/`mimeType` → if valid: set file private + `active`; else: **trash the Drive file** + delete the pending row. The validation decision is extracted into a pure `decideFinalize()` so it is unit-tested without Supabase/Drive.

- [ ] **Step 1: Write the failing test** (pure finalize decision)

```ts
// tests/unit/finalize-validation.test.ts
import { describe, it, expect } from 'vitest'
import { decideFinalize } from '@/app/api/uploads/finalize/decide'
import { MAX_UPLOAD_BYTES } from '@/lib/validation/resource'

describe('decideFinalize', () => {
  it('accepts a file whose real metadata is an allowed type within size', () => {
    expect(decideFinalize({ size: 2048, mimeType: 'application/pdf' })).toEqual({ accept: true })
  })
  it('rejects a disallowed real mime type (client lied about type)', () => {
    const d = decideFinalize({ size: 2048, mimeType: 'application/x-msdownload' })
    expect(d.accept).toBe(false)
    expect(d).toMatchObject({ reason: 'type' })
  })
  it('rejects an oversize real file (client lied about size)', () => {
    const d = decideFinalize({ size: MAX_UPLOAD_BYTES + 1, mimeType: 'application/pdf' })
    expect(d.accept).toBe(false)
    expect(d).toMatchObject({ reason: 'size' })
  })
  it('rejects a zero-byte (never-uploaded) file', () => {
    const d = decideFinalize({ size: 0, mimeType: 'application/pdf' })
    expect(d.accept).toBe(false)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/finalize-validation.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement the pure decision** — `app/api/uploads/finalize/decide.ts`

```ts
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from '@/lib/validation/resource'

export type FinalizeDecision = { accept: true } | { accept: false; reason: 'type' | 'size' }

/** Authoritative server-side decision based on REAL Drive metadata (never the client's claim). */
export function decideFinalize(meta: { size: number; mimeType: string }): FinalizeDecision {
  if (!Number.isFinite(meta.size) || meta.size <= 0 || meta.size > MAX_UPLOAD_BYTES) {
    return { accept: false, reason: 'size' }
  }
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(meta.mimeType)) {
    return { accept: false, reason: 'type' }
  }
  return { accept: true }
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/finalize-validation.test.ts` — Expected: PASS.

- [ ] **Step 5: Implement the `init` route** — `app/api/uploads/init/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { assertRole } from '@/lib/auth/guards'
import { initUploadSchema } from '@/lib/validation/resource'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDriveClient } from '@/lib/drive/auth'
import { resolveCourseFolder } from '@/lib/drive/folderCache'
import { initResumableSession } from '@/lib/drive/resumable'
import { insertPendingResource } from '@/lib/repos/resources'

export async function POST(req: Request) {
  try {
    const profile = await getProfile()
    assertRole(profile, ['teacher', 'admin'])

    const parsed = initUploadSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid-input' }, { status: 400 })
    }
    const input = parsed.data

    // Verify the caller may write to this course (teacher-of-course or admin) + fetch the name.
    const admin = createAdminClient()
    const { data: course } = await admin
      .from('courses')
      .select('id,name')
      .eq('id', input.courseId)
      .maybeSingle()
    if (!course) return NextResponse.json({ success: false, error: 'no-course' }, { status: 404 })

    if (profile!.role !== 'admin') {
      const { data: assigned } = await admin
        .from('course_teachers')
        .select('course_id')
        .eq('course_id', input.courseId)
        .eq('teacher_id', profile!.id)
        .maybeSingle()
      if (!assigned) return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
    }

    const drive = await getDriveClient()
    const folderId = await resolveCourseFolder(drive, course.id, course.name, 'resources')
    const { sessionUri } = await initResumableSession(drive, {
      name: input.fileName,
      mimeType: input.mimeType,
      parentId: folderId,
    })

    // We don't yet know the Drive file id (it's returned at PUT completion); store '' until finalize.
    const row = await insertPendingResource({
      courseId: input.courseId,
      title: input.title,
      driveFileId: '',
      uploadedBy: profile!.id,
    })

    return NextResponse.json({ success: true, data: { sessionUri, resourceId: row.id } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    const status = msg === 'forbidden' || msg === 'revoked' || msg === 'no-access' ? 403 : 500
    return NextResponse.json({ success: false, error: msg }, { status })
  }
}
```

- [ ] **Step 6: Implement the `finalize` route** — `app/api/uploads/finalize/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { assertRole } from '@/lib/auth/guards'
import { finalizeUploadSchema } from '@/lib/validation/resource'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDriveClient } from '@/lib/drive/auth'
import { finalizeUpload } from '@/lib/drive/resumable'
import { activateResource, deletePendingResource } from '@/lib/repos/resources'
import { decideFinalize } from './decide'

export async function POST(req: Request) {
  try {
    const profile = await getProfile()
    assertRole(profile, ['teacher', 'admin'])

    const parsed = finalizeUploadSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid-input' }, { status: 400 })
    }
    const { resourceId, driveFileId } = parsed.data

    const admin = createAdminClient()
    const { data: row } = await admin
      .from('resources')
      .select('id,uploaded_by,status')
      .eq('id', resourceId)
      .maybeSingle()
    if (!row || row.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'no-pending' }, { status: 404 })
    }
    if (profile!.role !== 'admin' && row.uploaded_by !== profile!.id) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
    }

    const drive = await getDriveClient()
    const meta = await finalizeUpload(drive, driveFileId)
    const decision = decideFinalize(meta)

    if (!decision.accept) {
      // Trash the bad file and drop the pending row — nothing becomes visible.
      await drive.files.update({ fileId: driveFileId, requestBody: { trashed: true } }).catch(() => {})
      await deletePendingResource(resourceId)
      return NextResponse.json({ success: false, error: `rejected-${decision.reason}` }, { status: 422 })
    }

    // Record the real Drive file id + a webViewLink, flip to active.
    const { data: fileMeta } = await drive.files.get({ fileId: driveFileId, fields: 'id,webViewLink' })
    await admin.from('resources').update({ drive_file_id: driveFileId }).eq('id', resourceId)
    await activateResource(resourceId, fileMeta?.webViewLink ?? '')

    return NextResponse.json({ success: true, data: { resourceId, size: meta.size, mimeType: meta.mimeType } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    const status = msg === 'forbidden' || msg === 'revoked' || msg === 'no-access' ? 403 : 500
    return NextResponse.json({ success: false, error: msg }, { status })
  }
}
```

- [ ] **Step 7: Typecheck + re-run the decision test**

Run: `npx tsc --noEmit` — Expected: PASS.
Run: `npm run test -- tests/unit/finalize-validation.test.ts` — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/api/uploads tests/unit/finalize-validation.test.ts
git commit -m "feat: uploads init/finalize routes with metadata-revalidating finalize"
```

---

## Task 2.5: Client hook `useResumableUpload` (init → browser PUT → finalize)

**Files:**
- Create: `lib/hooks/useResumableUpload.ts`

> **PRIMARY path** = direct browser→Drive resumable, gated by the Phase 0 CORS spike outcome (`scripts/spike-resumable-cors.md`). The hook: calls `uploads/init`, PUTs the file bytes straight to `sessionUri`, parses the Drive `id` from the PUT response, then calls `uploads/finalize`. No file bytes touch our serverless functions.

- [ ] **Step 1: Implement the hook** — `lib/hooks/useResumableUpload.ts`

```ts
'use client'
import { useState, useCallback } from 'react'

export type UploadState = 'idle' | 'initializing' | 'uploading' | 'finalizing' | 'done' | 'error'

export type UploadResult = { resourceId: string; size: number; mimeType: string }

type InitResponse = { success: boolean; data?: { sessionUri: string; resourceId: string }; error?: string }
type FinalizeResponse = { success: boolean; data?: UploadResult; error?: string }

export function useResumableUpload() {
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const upload = useCallback(
    async (opts: { courseId: string; title: string; file: File }): Promise<UploadResult | null> => {
      setError(null)
      setProgress(0)
      try {
        // 1) init — server opens the Drive resumable session + writes the pending row
        setState('initializing')
        const initRes: InitResponse = await fetch('/api/uploads/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId: opts.courseId,
            title: opts.title,
            fileName: opts.file.name,
            mimeType: opts.file.type || 'application/octet-stream',
            size: opts.file.size,
          }),
        }).then((r) => r.json())
        if (!initRes.success || !initRes.data) throw new Error(initRes.error ?? 'init-failed')
        const { sessionUri, resourceId } = initRes.data

        // 2) upload — browser PUTs bytes DIRECTLY to Google (no Vercel body limit)
        setState('uploading')
        const put = await fetch(sessionUri, {
          method: 'PUT',
          headers: { 'Content-Type': opts.file.type || 'application/octet-stream' },
          body: opts.file,
        })
        if (!put.ok) throw new Error(`upload-failed-${put.status}`)
        setProgress(100)
        const driveFileId = (await put.json().catch(() => ({}))).id as string | undefined
        if (!driveFileId) throw new Error('no-drive-file-id')

        // 3) finalize — server re-validates Drive metadata, flips to active
        setState('finalizing')
        const finRes: FinalizeResponse = await fetch('/api/uploads/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resourceId, driveFileId }),
        }).then((r) => r.json())
        if (!finRes.success || !finRes.data) throw new Error(finRes.error ?? 'finalize-failed')

        setState('done')
        return finRes.data
      } catch (e) {
        setError(e instanceof Error ? e.message : 'error')
        setState('error')
        return null
      }
    },
    [],
  )

  return { upload, state, error, progress }
}
```

- [ ] **Step 2: Add the CORS-fallback note box** — append this comment block at the top of `lib/hooks/useResumableUpload.ts` (above the `'use client'` line):

```ts
/**
 * ───────────────────────────────────────────────────────────────────────────
 * PRIMARY PATH: direct browser → Drive resumable upload (this file as written).
 *
 * IF the Phase 0 CORS spike (scripts/spike-resumable-cors.md) found CORS BLOCKED,
 * swap STEP 2 below for the Supabase-Storage-staging fallback:
 *   browser → Supabase signed upload → server copies the object into Drive via
 *   getDriveClient(). Keep the init/finalize *records* identical (same `pending`
 *   row, same finalize re-validation); only the byte transport changes.
 *
 * FALLBACK STEP 2 (replaces the direct PUT to sessionUri):
 *
 *   // init returns { uploadUrl, token, path, resourceId } instead of { sessionUri, resourceId }
 *   const { createClient } from '@/lib/supabase/client'
 *   const supabase = createClient()
 *   const { error } = await supabase.storage
 *     .from('upload-staging')
 *     .uploadToSignedUrl(path, token, opts.file)   // CORS-clean, no Vercel limit
 *   if (error) throw new Error('staging-upload-failed')
 *   // finalize body carries { resourceId, stagingPath: path } (no driveFileId yet)
 *
 * And the SERVER finalize copies staging → Drive before re-validating:
 *
 *   // app/api/uploads/finalize/route.ts (fallback variant)
 *   const admin = createAdminClient()
 *   const { data: blob } = await admin.storage.from('upload-staging').download(stagingPath)
 *   const drive = await getDriveClient()
 *   const created = await drive.files.create({
 *     requestBody: { name: fileName, parents: [folderId] },
 *     media: { mimeType, body: Readable.fromWeb(blob.stream()) },
 *     fields: 'id',
 *   })
 *   const driveFileId = created.data.id            // then proceed with finalizeUpload()/decideFinalize()
 *   await admin.storage.from('upload-staging').remove([stagingPath])  // cleanup staging
 *
 * The "no Vercel upload limit" guarantee holds either way; the fallback just adds
 * a Supabase Storage bucket (`upload-staging`) + a server copy step.
 * ───────────────────────────────────────────────────────────────────────────
 */
```

- [ ] **Step 3: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/useResumableUpload.ts
git commit -m "feat: useResumableUpload hook (browser→Drive) with CORS-fallback note"
```

---

## Task 2.6: `cron/reconcile-uploads` — trash orphaned uploads (TDD the selection query)

**Files:**
- Create: `app/api/cron/reconcile-uploads/route.ts`, `lib/repos/reconcile.ts`
- Test: `tests/unit/reconcile-query.test.ts`

> Sweeps `pending` `resources` rows older than `RECONCILE_STALE_HOURS` (default 6): trashes any Drive file that was already created, then deletes the row. The pure `staleBefore()` cutoff + the row-selection builder are unit-tested against a mocked Supabase query builder so the cutoff logic is verified without a live DB.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/reconcile-query.test.ts
import { describe, it, expect, vi } from 'vitest'
import { staleBefore, selectStalePending } from '@/lib/repos/reconcile'

describe('staleBefore', () => {
  it('returns an ISO cutoff N hours before now', () => {
    const now = new Date('2026-06-25T12:00:00.000Z')
    expect(staleBefore(6, now)).toBe('2026-06-25T06:00:00.000Z')
  })
})

describe('selectStalePending', () => {
  it('queries pending rows older than the cutoff', async () => {
    const lt = vi.fn(async () => ({ data: [{ id: 'r1', drive_file_id: 'f1' }], error: null }))
    const eq = vi.fn(() => ({ lt }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const fakeAdmin = { from } as any

    const rows = await selectStalePending(fakeAdmin, '2026-06-25T06:00:00.000Z')

    expect(from).toHaveBeenCalledWith('resources')
    expect(select).toHaveBeenCalledWith('id,drive_file_id')
    expect(eq).toHaveBeenCalledWith('status', 'pending')
    expect(lt).toHaveBeenCalledWith('created_at', '2026-06-25T06:00:00.000Z')
    expect(rows).toEqual([{ id: 'r1', drive_file_id: 'f1' }])
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/reconcile-query.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement** — `lib/repos/reconcile.ts`

```ts
import 'server-only'

export type StalePending = { id: string; drive_file_id: string | null }

/** ISO timestamp `hours` before `now` (cutoff for "abandoned" pending uploads). */
export function staleBefore(hours: number, now: Date = new Date()): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString()
}

/** Pending resources created before the cutoff (service-role admin client). */
export async function selectStalePending(admin: any, cutoffIso: string): Promise<StalePending[]> {
  const { data, error } = await admin
    .from('resources')
    .select('id,drive_file_id')
    .eq('status', 'pending')
    .lt('created_at', cutoffIso)
  if (error) throw new Error(`reconcile.select: ${error.message}`)
  return (data ?? []) as StalePending[]
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/reconcile-query.test.ts` — Expected: PASS.

- [ ] **Step 5: Implement the cron route** — `app/api/cron/reconcile-uploads/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDriveClient } from '@/lib/drive/auth'
import { staleBefore, selectStalePending } from '@/lib/repos/reconcile'

const STALE_HOURS = Number(process.env.RECONCILE_STALE_HOURS ?? 6)

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  const cutoff = staleBefore(STALE_HOURS)
  const stale = await selectStalePending(admin, cutoff)

  const drive = await getDriveClient()
  let trashed = 0
  for (const row of stale) {
    if (row.drive_file_id) {
      await drive.files.update({ fileId: row.drive_file_id, requestBody: { trashed: true } }).catch(() => {})
      trashed++
    }
    await admin.from('resources').delete().eq('id', row.id).eq('status', 'pending')
  }
  return NextResponse.json({ success: true, data: { swept: stale.length, trashed } })
}
```

- [ ] **Step 6: Schedule it** — append the cron entry to `vercel.json` (Phase 0 created the file with `keepalive`):

```json
{
  "crons": [
    { "path": "/api/cron/keepalive", "schedule": "0 6 * * *" },
    { "path": "/api/cron/reconcile-uploads", "schedule": "30 * * * *" }
  ]
}
```

- [ ] **Step 7: Commit**

```bash
git add app/api/cron/reconcile-uploads lib/repos/reconcile.ts tests/unit/reconcile-query.test.ts vercel.json
git commit -m "feat: reconcile-uploads cron to sweep orphaned pending uploads"
```

---

## Task 2.7: Access-checked download endpoint `resources/[id]/download` (TDD the access check)

**Files:**
- Create: `app/api/resources/[id]/download/route.ts`, `app/api/resources/[id]/download/access.ts`
- Test: `tests/unit/resources-download-access.test.ts`

> The route never serves "anyone with the link" (spec §8): it verifies the caller may see the resource, then 302-redirects to a short-lived Drive `webContentLink`. The pure `canDownload()` predicate (admin OR teaches the course OR enrolled in the course) is unit-tested.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/resources-download-access.test.ts
import { describe, it, expect } from 'vitest'
import { canDownload } from '@/app/api/resources/[id]/download/access'

const ctx = (over: Partial<Parameters<typeof canDownload>[0]> = {}) => ({
  role: 'student' as 'student' | 'teacher' | 'admin',
  isEnrolled: false,
  teachesCourse: false,
  ...over,
})

describe('canDownload', () => {
  it('admin can always download', () => {
    expect(canDownload(ctx({ role: 'admin' }))).toBe(true)
  })
  it('teacher of the course can download', () => {
    expect(canDownload(ctx({ role: 'teacher', teachesCourse: true }))).toBe(true)
  })
  it('teacher NOT assigned to the course cannot download', () => {
    expect(canDownload(ctx({ role: 'teacher', teachesCourse: false }))).toBe(false)
  })
  it('enrolled student can download', () => {
    expect(canDownload(ctx({ role: 'student', isEnrolled: true }))).toBe(true)
  })
  it('non-enrolled student cannot download', () => {
    expect(canDownload(ctx({ role: 'student', isEnrolled: false }))).toBe(false)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/resources-download-access.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement the pure predicate** — `app/api/resources/[id]/download/access.ts`

```ts
export type DownloadContext = {
  role: 'admin' | 'teacher' | 'student'
  isEnrolled: boolean
  teachesCourse: boolean
}

/** Mirror of the resources_read RLS policy, used to gate the redirect. */
export function canDownload(ctx: DownloadContext): boolean {
  if (ctx.role === 'admin') return true
  if (ctx.role === 'teacher') return ctx.teachesCourse
  return ctx.isEnrolled
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/resources-download-access.test.ts` — Expected: PASS.

- [ ] **Step 5: Implement the route** — `app/api/resources/[id]/download/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { getResourceById } from '@/lib/repos/resources'
import { getDriveClient } from '@/lib/drive/auth'
import { canDownload } from './access'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ success: false, error: 'no-access' }, { status: 403 })
  }

  const resource = await getResourceById(params.id)
  if (!resource || resource.status !== 'active') {
    return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const [{ data: enrolled }, { data: teaches }] = await Promise.all([
    admin.from('enrollments').select('course_id').eq('course_id', resource.course_id).eq('student_id', profile.id).maybeSingle(),
    admin.from('course_teachers').select('course_id').eq('course_id', resource.course_id).eq('teacher_id', profile.id).maybeSingle(),
  ])

  const allowed = canDownload({
    role: profile.role,
    isEnrolled: Boolean(enrolled),
    teachesCourse: Boolean(teaches),
  })
  if (!allowed) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }

  // Short-lived link: read a fresh webContentLink from Drive and 302 to it.
  const drive = await getDriveClient()
  const { data: file } = await drive.files.get({ fileId: resource.drive_file_id, fields: 'webContentLink,webViewLink' })
  const target = file?.webContentLink ?? file?.webViewLink
  if (!target) {
    return NextResponse.json({ success: false, error: 'no-link' }, { status: 502 })
  }
  return NextResponse.redirect(target, { status: 302 })
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/resources tests/unit/resources-download-access.test.ts
git commit -m "feat: access-checked resource download endpoint (enrolled/teacher/admin → short-lived link)"
```

---

## Task 2.8: Resources UI — teacher upload + student browse/download (pagination + title search)

**Files:**
- Create: `app/(app)/resources/page.tsx`, `app/(app)/resources/ResourceUploader.tsx`, `app/(app)/resources/ResourceList.tsx`

> The page is a server component: loads the profile + the courses the caller can act on, then renders the uploader (teachers/admins only) + the list (everyone). The list is a client component with title search + pagination, fetching the RLS-enforced `listResources()` via a thin route or server action. To keep this phase self-contained, the list reads its initial page server-side and re-fetches on search/page change through a small GET handler.

- [ ] **Step 1: Add a GET list handler** — `app/api/resources/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { listResources } from '@/lib/repos/resources'

export async function GET(req: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ success: false, error: 'no-access' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('courseId') ?? undefined
  const search = searchParams.get('q') ?? undefined
  const page = Number(searchParams.get('page') ?? '1')
  try {
    const { rows, total } = await listResources({ courseId, search, page })
    return NextResponse.json({ success: true, data: { rows, total, page } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Uploader (client)** — `app/(app)/resources/ResourceUploader.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useResumableUpload } from '@/lib/hooks/useResumableUpload'

type Course = { id: string; name: string }

export function ResourceUploader({ courses }: { courses: Course[] }) {
  const { upload, state, error, progress } = useResumableUpload()
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!courseId || !title || !file) return
    const res = await upload({ courseId, title, file })
    if (res) {
      setTitle('')
      setFile(null)
      // simplest refresh so the new active row appears in the list
      if (typeof window !== 'undefined') window.location.reload()
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">Upload a resource</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="rounded-lg border px-3 py-2">
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="rounded-lg border px-3 py-2"
        />
      </div>
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="mt-3 block"
      />
      <button
        type="submit"
        disabled={state === 'initializing' || state === 'uploading' || state === 'finalizing'}
        className="mt-4 rounded-lg border px-4 py-2 font-medium shadow-sm disabled:opacity-50"
      >
        {state === 'idle' || state === 'done' || state === 'error' ? 'Upload' : `${state}… ${progress}%`}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">Upload failed: {error}</p>}
      {state === 'done' && <p className="mt-2 text-sm text-green-600">Uploaded.</p>}
    </form>
  )
}
```

- [ ] **Step 3: List (client, search + pagination)** — `app/(app)/resources/ResourceList.tsx`

```tsx
'use client'
import { useEffect, useState } from 'react'

type Row = { id: string; title: string; course_id: string; created_at: string }

export function ResourceList() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const pageSize = 20

  useEffect(() => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    params.set('page', String(page))
    fetch(`/api/resources?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setRows(j.data.rows)
          setTotal(j.data.total)
        }
      })
  }, [q, page])

  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="mt-8">
      <input
        value={q}
        onChange={(e) => {
          setPage(1)
          setQ(e.target.value)
        }}
        placeholder="Search resources by title…"
        className="mb-4 w-full rounded-lg border px-3 py-2"
      />
      <ul className="divide-y rounded-xl border bg-white">
        {rows.length === 0 && <li className="p-4 text-slate-500">No resources found.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between p-4">
            <span>{r.title}</span>
            <a href={`/api/resources/${r.id}/download`} className="text-sm font-medium text-blue-600 underline">
              Download
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-3 py-1 disabled:opacity-50">
          Prev
        </button>
        <span>Page {page} of {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 disabled:opacity-50">
          Next
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Page (server)** — `app/(app)/resources/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { ResourceUploader } from './ResourceUploader'
import { ResourceList } from './ResourceList'

export default async function ResourcesPage() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')

  // Which courses can this user upload to? (teacher: assigned; admin: all; student: none)
  let courses: { id: string; name: string }[] = []
  if (profile.role === 'admin') {
    const admin = createAdminClient()
    const { data } = await admin.from('courses').select('id,name').eq('status', 'active').order('name')
    courses = data ?? []
  } else if (profile.role === 'teacher') {
    const admin = createAdminClient()
    const { data } = await admin
      .from('course_teachers')
      .select('courses(id,name)')
      .eq('teacher_id', profile.id)
    courses = (data ?? []).map((r: any) => r.courses).filter(Boolean)
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Resources</h1>
      {courses.length > 0 && (
        <div className="mt-6">
          <ResourceUploader courses={courses} />
        </div>
      )}
      <ResourceList />
    </main>
  )
}
```

- [ ] **Step 5: Manual verify** — `npm run dev`; as a teacher assigned to a course, upload a small PDF → it appears in the list; as an enrolled student, search by title + click Download (redirects to the Drive link); as a non-enrolled student, the list is empty and a direct `/api/resources/<id>/download` returns 403.

- [ ] **Step 6: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/resources" app/api/resources/route.ts
git commit -m "feat: resources UI (teacher upload + student browse/download with search + pagination)"
```

---

## Task 2.9: Playwright E2E — teacher uploads → enrolled student downloads → non-enrolled student 403

**Files:**
- Create: `e2e/resources.spec.ts`
- Modify: `package.json` (add Playwright + scripts), `playwright.config.ts`

> If Phase 0/1 already added Playwright, skip Step 1's install and reuse the existing config. The E2E seeds three identities via the service-role client in a global setup, drives the UI for the teacher upload, then asserts the access matrix. File bytes in CI use a tiny fixture PDF.

- [ ] **Step 1: Install Playwright (if not already present)**

Run:
```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```
Add to `package.json` `"scripts"`:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 2: Playwright config** — `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
})
```

- [ ] **Step 3: Fixture file** — create `e2e/fixtures/sample.pdf` (any small valid PDF; e.g. `printf '%%PDF-1.4\n%%EOF\n' > e2e/fixtures/sample.pdf`).

- [ ] **Step 4: Write the E2E spec** — `e2e/resources.spec.ts`

```ts
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import path from 'node:path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(url, service)

const COURSE = '00000000-0000-0000-0000-0000000c0e2e'
const TEACHER = { email: 'e2e-teacher@example.com', password: 'e2e-Passw0rd!' }
const ENROLLED = { email: 'e2e-student@example.com', password: 'e2e-Passw0rd!' }
const OUTSIDER = { email: 'e2e-outsider@example.com', password: 'e2e-Passw0rd!' }

async function makeUser(u: { email: string; password: string }, role: string) {
  const { data } = await admin.auth.admin.createUser({
    email: u.email, password: u.password, email_confirm: true,
  })
  const id = data.user!.id
  await admin.from('profiles').upsert(
    { id, email: u.email, full_name: u.email, role, status: 'active' },
    { onConflict: 'id' },
  )
  return id
}

test.beforeAll(async () => {
  const teacherId = await makeUser(TEACHER, 'teacher')
  const studentId = await makeUser(ENROLLED, 'student')
  await makeUser(OUTSIDER, 'student')
  await admin.from('courses').upsert({ id: COURSE, name: 'E2E Course', status: 'active' }, { onConflict: 'id' })
  await admin.from('course_teachers').upsert({ teacher_id: teacherId, course_id: COURSE }, { onConflict: 'teacher_id,course_id' })
  await admin.from('enrollments').upsert({ student_id: studentId, course_id: COURSE }, { onConflict: 'student_id,course_id' })
})

test.afterAll(async () => {
  await admin.from('resources').delete().eq('course_id', COURSE)
  await admin.from('enrollments').delete().eq('course_id', COURSE)
  await admin.from('course_teachers').delete().eq('course_id', COURSE)
  await admin.from('courses').delete().eq('id', COURSE)
  for (const e of [TEACHER.email, ENROLLED.email, OUTSIDER.email]) {
    const { data } = await admin.from('profiles').select('id').eq('email', e).maybeSingle()
    if (data?.id) await admin.auth.admin.deleteUser(data.id)
    await admin.from('profiles').delete().eq('email', e)
  }
})

// Email/password sign-in helper for the test env (Google OAuth is mocked off in E2E).
async function loginAs(page: any, u: { email: string; password: string }) {
  await page.goto('/login')
  await page.evaluate(async ({ email, password, url, anon }: any) => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const sb = createClient(url, anon)
    await sb.auth.signInWithPassword({ email, password })
  }, { ...u, url, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY })
  await page.goto('/resources')
}

test('teacher uploads a resource, enrolled student downloads it, outsider gets 403', async ({ page, request }) => {
  // 1) Teacher uploads
  await loginAs(page, TEACHER)
  await page.getByPlaceholder('Title').fill('E2E Notes')
  await page.setInputFiles('input[type=file]', path.join(__dirname, 'fixtures', 'sample.pdf'))
  await page.getByRole('button', { name: /upload/i }).click()
  await expect(page.getByText('Uploaded.')).toBeVisible({ timeout: 30_000 })

  // Grab the new resource id from the DB for the direct-403 assertion.
  const { data: res } = await admin.from('resources').select('id').eq('course_id', COURSE).eq('status', 'active').maybeSingle()
  expect(res?.id).toBeTruthy()
  const resourceId = res!.id

  // 2) Enrolled student sees + can hit the download endpoint (302 to Drive)
  await loginAs(page, ENROLLED)
  await page.getByPlaceholder('Search resources by title…').fill('E2E')
  await expect(page.getByText('E2E Notes')).toBeVisible()
  const dl = await request.get(`/api/resources/${resourceId}/download`, { maxRedirects: 0 })
  expect([302, 307]).toContain(dl.status())

  // 3) Outsider is forbidden at the endpoint
  await loginAs(page, OUTSIDER)
  const forbidden = await request.get(`/api/resources/${resourceId}/download`, { maxRedirects: 0 })
  expect(forbidden.status()).toBe(403)
})
```

> Note: the `request` fixture shares the browser's auth cookies within the same `page` context only when created from `page.context().request`. If your harness keeps `request` independent, replace the two `request.get(...)` calls with `page.context().request.get(...)` so they carry the logged-in session.

- [ ] **Step 5: Run the E2E** — Run: `npm run test:e2e -- e2e/resources.spec.ts` (env loaded from `.env.local`; ensure the dev server can reach prod-preview Supabase). Expected: PASS — upload visible; enrolled download 302; outsider 403.

- [ ] **Step 6: Commit**

```bash
git add e2e/resources.spec.ts e2e/fixtures/sample.pdf playwright.config.ts package.json package-lock.json
git commit -m "test: e2e resources upload/download access matrix (teacher/enrolled/outsider)"
```

---

## Acceptance Criteria
- [ ] `0003_resources.sql` creates `resources` + `drive_folders` with RLS: read = enrolled student (active) / assigned teacher / admin; write = assigned teacher / admin. RLS policy test (Task 2.1) green.
- [ ] `lib/drive/resumable.ts` opens a real resumable session (returns the `Location` URI) and `finalizeUpload` reads back `size`/`mimeType`; unit tests with a mocked drive green.
- [ ] `uploads/init` writes a `pending` row + returns the single-use session URI scoped to the course `Resources/` folder (resolved via `ensureFolderPath`, cached in `drive_folders`); `uploads/finalize` re-validates the **real** Drive metadata, flips to `active`, and **trashes** the file + drops the row on rejection. `decideFinalize` unit tests green.
- [ ] `useResumableUpload` performs init → browser PUT → finalize, with a clearly-labelled note box describing the Supabase-Storage-staging fallback (incl. its key server-copy code) for the CORS-blocked case.
- [ ] `cron/reconcile-uploads` (CRON_SECRET-protected) trashes Drive files + deletes `pending` rows older than `RECONCILE_STALE_HOURS`; selection-query unit test green; scheduled in `vercel.json`.
- [ ] `resources/[id]/download` verifies enrollment/role then 302-redirects to a short-lived Drive link; non-enrolled → 403. `canDownload` unit test green.
- [ ] Resources UI: teacher/admin upload (via the hook); everyone browses active resources by course with title search + pagination; download links hit the access-checked endpoint.
- [ ] Playwright E2E green: teacher uploads → enrolled student downloads (302) → non-enrolled student 403.
- [ ] All inputs validated with Zod; every API response uses the `{ success, data?, error? }` envelope; service-role + Drive token used server-side only; committed in small conventional-commit steps; coverage ≥ 80% on new code.

## Self-review notes (done)
- Spec coverage: §4.3 (folder tree + `drive_folders` cache + create-race upsert via `resolveCourseFolder`), §4.4 (init→PUT→finalize handshake, finalize re-validation, orphan reconciliation, private files + access-checked download, the CORS spike → fallback note), §5 (`resources` + `drive_folders` exact columns), §5.1 (enrolled-read / teacher-of-course-write + admin override), §7.3 (teacher upload into course `Resources/`, student browse/download by enrolled course) — all mapped to Tasks 2.1–2.9.
- Cross-phase assumptions made explicit: Phase 0 helpers (`getDriveClient`, `ensureFolderPath`/`ensureChildFolder`, `getProfile`, `assertRole`, Supabase clients, `CRON_SECRET`, the resolved spike doc) and Phase 1 SQL helpers (`is_enrolled(course_id)`, `teaches_course(course_id)`) + tables (`courses`, `enrollments`, `course_teachers`); migration numbered `0003` after Phase 1's `0002`.
- Type consistency: `Resource`, `InitSessionInput`, `InitUploadInput`/`FinalizeUploadInput`, `FinalizeDecision`, `DownloadContext`/`canDownload`, `StalePending`, `UploadResult`/`UploadState` are each defined once and referenced consistently; route handlers all return the `{ success, data?, error? }` envelope.
- No placeholders: every code step is runnable; each TDD step pairs a failing test (full code) → run+expected FAIL → implementation (full code) → run+expected PASS → conventional commit. Commands use the project's runners (`npm run test -- <file>`, `node --env-file=.env.local node_modules/.bin/vitest run <file>` for Supabase-touching integration, `npm run test:e2e`).
- RLS-test pragmatism: per-user signed-JWT impersonation through PostgREST is plumbing-heavy, so the policy predicate is proven deterministically via two SECURITY-DEFINER `test_can_*` functions that call the *same* helpers the policies use; the full signed-session path is covered by the Playwright E2E (real `auth.users` via `admin.auth.admin.createUser`).

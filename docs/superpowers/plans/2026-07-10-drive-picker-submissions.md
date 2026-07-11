# Drive Picker submissions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student attach homework via the Google Drive Picker (one click: upload/pick → auto-share → submit), keeping the existing paste-a-link path as a fallback and all current on-time/late tracking.

**Architecture:** A thin client-only glue module (`picker.ts`) loads Google Identity Services + the Picker and returns a picked file; all decisions/parsing live in pure, unit-tested helpers (`driveConfig`, `pickerResult`, `driveShare`). The picked file's `webViewLink` flows into the existing `submitLinkAction`/`recordSubmission` path. With `NEXT_PUBLIC_GOOGLE_*` unset (local/mock), the feature is invisible and the paste path is unchanged.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Zod, Supabase, Google Picker API + Google Identity Services, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-10-drive-picker-submissions-design.md`

---

## File map

- Create: `src/lib/google/driveConfig.ts`, `src/lib/google/pickerResult.ts`, `src/lib/google/driveShare.ts`, `src/lib/google/picker.ts`
- Create: `src/lib/assignments/submitSchema.ts`
- Create: `supabase/migrations/0007_submission_file_name.sql`
- Create tests: `tests/unit/driveConfig.test.ts`, `tests/unit/pickerResult.test.ts`, `tests/unit/driveShare.test.ts`, `tests/unit/submitSchema.test.ts`
- Modify: `src/lib/repos/submissions.ts`, `src/app/(prt)/assignments/submit-action.ts`, `src/app/(prt)/assignments/SubmitForm.tsx`, and SubmitForm call sites
- Modify docs: `.env.example`, `docs/setup_guide.md`

---

### Task 1: Drive config + env

**Files:**
- Create: `src/lib/google/driveConfig.ts`
- Test: `tests/unit/driveConfig.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/driveConfig.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readDriveConfig, isPickerConfigured } from '@/lib/google/driveConfig'

afterEach(() => vi.unstubAllEnvs())

function setAll() {
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'cid')
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_API_KEY', 'key')
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_APP_ID', '123')
}

describe('driveConfig', () => {
  it('readDriveConfig is null when any var is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'cid')
    expect(readDriveConfig()).toBeNull()
  })

  it('readDriveConfig returns the three values when all set', () => {
    setAll()
    expect(readDriveConfig()).toEqual({ clientId: 'cid', apiKey: 'key', appId: '123' })
  })

  it('isPickerConfigured is false in mock mode even when set', () => {
    setAll()
    vi.stubEnv('NEXT_PUBLIC_MOCK_MODE', '1')
    expect(isPickerConfigured()).toBe(false)
  })

  it('isPickerConfigured is true when configured and not mock', () => {
    setAll()
    vi.stubEnv('NEXT_PUBLIC_MOCK_MODE', '0')
    expect(isPickerConfigured()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/driveConfig.test.ts`
Expected: FAIL — cannot resolve `@/lib/google/driveConfig`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/google/driveConfig.ts
export type DriveConfig = {
  clientId: string
  apiKey: string
  appId: string
}

/** All three client-side Google keys, or null if any is missing. */
export function readDriveConfig(): DriveConfig | null {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? ''
  const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? ''
  if (!clientId || !apiKey || !appId) return null
  return { clientId, apiKey, appId }
}

/** True only when Google is configured AND we're not in offline mock mode. */
export function isPickerConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_MOCK_MODE === '1') return false
  return readDriveConfig() !== null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/driveConfig.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the env vars to `.env.example`**

Append after the marketing section:

```bash
# ── Google Drive Picker for submissions (optional) ────────────────────────────
# Client-side keys (public by design — lock them to your origin + the Picker/Drive
# APIs in Google Cloud). Leave unset to keep the manual paste-a-link flow.
# NEXT_PUBLIC_GOOGLE_CLIENT_ID=        # OAuth 2.0 Web client ID
# NEXT_PUBLIC_GOOGLE_API_KEY=          # API key with the Picker API enabled
# NEXT_PUBLIC_GOOGLE_APP_ID=           # Google Cloud project number
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/google/driveConfig.ts tests/unit/driveConfig.test.ts .env.example
git commit -m "feat(portal): Drive Picker config gate (paste fallback when unset)"
```

---

### Task 2: Picker result parser

**Files:**
- Create: `src/lib/google/pickerResult.ts`
- Test: `tests/unit/pickerResult.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/pickerResult.test.ts
import { describe, it, expect } from 'vitest'
import { parsePickerDoc } from '@/lib/google/pickerResult'

describe('parsePickerDoc', () => {
  it('returns null for null/undefined', () => {
    expect(parsePickerDoc(null)).toBeNull()
    expect(parsePickerDoc(undefined)).toBeNull()
  })

  it('returns null when id or url is missing', () => {
    expect(parsePickerDoc({ id: 'x' })).toBeNull()
    expect(parsePickerDoc({ url: 'https://drive.google.com/file/d/x/view' })).toBeNull()
  })

  it('parses a full doc', () => {
    expect(
      parsePickerDoc({
        id: 'abc',
        url: 'https://drive.google.com/file/d/abc/view',
        name: 'ch4.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
      }),
    ).toEqual({
      id: 'abc',
      url: 'https://drive.google.com/file/d/abc/view',
      name: 'ch4.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1234,
    })
  })

  it('coerces a string sizeBytes and defaults a blank name', () => {
    const r = parsePickerDoc({ id: 'a', url: 'u', sizeBytes: '999' })
    expect(r?.sizeBytes).toBe(999)
    expect(r?.name).toBe('Untitled')
  })

  it('sets sizeBytes null when absent or unparseable', () => {
    expect(parsePickerDoc({ id: 'a', url: 'u' })?.sizeBytes).toBeNull()
    expect(parsePickerDoc({ id: 'a', url: 'u', sizeBytes: 'nope' })?.sizeBytes).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/pickerResult.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/google/pickerResult.ts
export type PickedFile = {
  id: string
  url: string
  name: string
  mimeType: string
  sizeBytes: number | null
}

type RawPickerDoc = {
  id?: unknown
  url?: unknown
  name?: unknown
  mimeType?: unknown
  sizeBytes?: unknown
}

function toSize(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return null
}

/** Normalize a Google Picker document into our own shape, or null if unusable. */
export function parsePickerDoc(raw: RawPickerDoc | null | undefined): PickedFile | null {
  if (!raw) return null
  const id = typeof raw.id === 'string' ? raw.id : ''
  const url = typeof raw.url === 'string' ? raw.url : ''
  if (!id || !url) return null
  const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name : 'Untitled'
  return {
    id,
    url,
    name,
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : '',
    sizeBytes: toSize(raw.sizeBytes),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/pickerResult.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/google/pickerResult.ts tests/unit/pickerResult.test.ts
git commit -m "feat(portal): parse Google Picker documents into a typed shape"
```

---

### Task 3: `file_name` column + repo

**Files:**
- Create: `supabase/migrations/0007_submission_file_name.sql`
- Modify: `src/lib/repos/submissions.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0007_submission_file_name.sql
-- Optional display name captured when a file is attached via the Drive Picker.
alter table submissions add column if not exists file_name text;
```

- [ ] **Step 2: Add `file_name` to the type and record path**

In `src/lib/repos/submissions.ts`, add to the `Submission` type after `drive_link`:

```ts
  drive_link: string | null
  file_name: string | null
```

Extend the `recordSubmission` input and insert. Change the signature to:

```ts
export async function recordSubmission(input: {
  assignment_id: string
  student_id: string
  drive_link: string | null
  file_name?: string | null
  due_date: string
}): Promise<Submission> {
```

and add to the `.insert({...})` object:

```ts
      drive_link: input.drive_link,
      file_name: input.file_name ?? null,
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exit 0 (no type errors). *(The mock harness tolerates the extra nullable column; existing rows read back `file_name` as `undefined`→ treated as null by callers.)*

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_submission_file_name.sql "src/lib/repos/submissions.ts"
git commit -m "feat(db): submissions.file_name for attached-file display"
```

---

### Task 4: Extract + extend the submit schema

**Files:**
- Create: `src/lib/assignments/submitSchema.ts`
- Test: `tests/unit/submitSchema.test.ts`
- Modify: `src/app/(prt)/assignments/submit-action.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/submitSchema.test.ts
import { describe, it, expect } from 'vitest'
import { submissionInputSchema } from '@/lib/assignments/submitSchema'

const uuid = 'a5000000-0000-4000-8000-000000000001'

describe('submissionInputSchema', () => {
  it('accepts a valid url without a file name', () => {
    const r = submissionInputSchema.safeParse({ assignment_id: uuid, url: 'https://drive.google.com/file/d/x/view' })
    expect(r.success).toBe(true)
  })

  it('accepts an optional file name', () => {
    const r = submissionInputSchema.safeParse({ assignment_id: uuid, url: 'https://x.test/a', file_name: '2026-07-10-ch4.pdf' })
    expect(r.success).toBe(true)
  })

  it('rejects a non-uuid assignment id', () => {
    const r = submissionInputSchema.safeParse({ assignment_id: 'nope', url: 'https://x.test/a' })
    expect(r.success).toBe(false)
  })

  it('rejects a bad url', () => {
    const r = submissionInputSchema.safeParse({ assignment_id: uuid, url: 'not-a-url' })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/submitSchema.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create the schema module**

```ts
// src/lib/assignments/submitSchema.ts
import { z } from 'zod'

export const submissionInputSchema = z.object({
  assignment_id: z.string().uuid(),
  url: z.string().trim().url(),
  file_name: z.string().trim().max(255).optional(),
})

export type SubmissionInput = z.infer<typeof submissionInputSchema>
```

- [ ] **Step 4: Use it in the action**

In `src/app/(prt)/assignments/submit-action.ts`, remove the inline `const schema = z.object({...})`, import the shared schema, parse `file_name`, and pass it through:

```ts
import { submissionInputSchema } from '@/lib/assignments/submitSchema'
// ...
  const parsed = submissionInputSchema.safeParse({
    assignment_id: String(formData.get('assignment_id') ?? ''),
    url: String(formData.get('url') ?? ''),
    file_name: formData.get('file_name') ? String(formData.get('file_name')) : undefined,
  })
  if (!parsed.success) throw new Error('Please paste a valid link')
  // ...
  await recordSubmission({
    assignment_id: assignment.id,
    student_id: me.id,
    drive_link: parsed.data.url,
    file_name: parsed.data.file_name ?? null,
    due_date: assignment.due_date,
  })
```

- [ ] **Step 5: Run tests + types**

Run: `npx vitest run tests/unit/submitSchema.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests) and tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assignments/submitSchema.ts tests/unit/submitSchema.test.ts "src/app/(prt)/assignments/submit-action.ts"
git commit -m "feat(portal): shared submission schema, accepts optional file_name"
```

---

### Task 5: Drive share helper

**Files:**
- Create: `src/lib/google/driveShare.ts`
- Test: `tests/unit/driveShare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/driveShare.test.ts
import { describe, it, expect } from 'vitest'
import { buildShareRequest } from '@/lib/google/driveShare'

describe('buildShareRequest', () => {
  it('POSTs an anyone-reader permission to the file', () => {
    const req = buildShareRequest('abc123', 'tok')
    expect(req.method).toBe('POST')
    expect(req.url).toBe('https://www.googleapis.com/drive/v3/files/abc123/permissions')
    expect(req.headers.Authorization).toBe('Bearer tok')
    expect(req.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(req.body)).toEqual({ role: 'reader', type: 'anyone' })
  })

  it('url-encodes the file id', () => {
    expect(buildShareRequest('a/b', 't').url).toContain('files/a%2Fb/permissions')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/driveShare.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/google/driveShare.ts
export type ShareRequest = {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: string
}

/** Build the Drive REST call that makes a file readable by anyone with the link. */
export function buildShareRequest(fileId: string, accessToken: string): ShareRequest {
  return {
    url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  }
}

/** Share the file; throws on a non-2xx response. */
export async function shareAnyoneWithLink(fileId: string, accessToken: string): Promise<void> {
  const req = buildShareRequest(fileId, accessToken)
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body })
  if (!res.ok) throw new Error(`Drive share failed: ${res.status}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/driveShare.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/google/driveShare.ts tests/unit/driveShare.test.ts
git commit -m "feat(portal): Drive share helper (anyone-with-link reader)"
```

---

### Task 6: Client Picker glue (manual-tested)

**Files:**
- Create: `src/lib/google/picker.ts`

> This module is thin DOM/Google wiring; it has no unit test (see spec §8). All logic it calls (`readDriveConfig`, `parsePickerDoc`) is already tested.

- [ ] **Step 1: Write the module**

```ts
// src/lib/google/picker.ts
'use client'
import { readDriveConfig } from './driveConfig'
import { parsePickerDoc, type PickedFile } from './pickerResult'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const GAPI_SRC = 'https://apis.google.com/js/api.js'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

/* eslint-disable @typescript-eslint/no-explicit-any -- third-party globals */
declare global {
  interface Window {
    gapi: any
    google: any
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

let pickerLoaded = false
async function ensureLoaded(): Promise<void> {
  await Promise.all([loadScript(GIS_SRC), loadScript(GAPI_SRC)])
  if (!pickerLoaded) {
    await new Promise<void>((resolve) => window.gapi.load('picker', () => resolve()))
    pickerLoaded = true
  }
}

/** Get a short-lived drive.file access token for the current student. */
export async function getDriveAccessToken(loginHint?: string): Promise<string> {
  const cfg = readDriveConfig()
  if (!cfg) throw new Error('Google Drive is not configured')
  await ensureLoaded()
  return new Promise<string>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: DRIVE_SCOPE,
      login_hint: loginHint,
      callback: (resp: any) => (resp.error ? reject(new Error(resp.error)) : resolve(resp.access_token)),
    })
    client.requestAccessToken()
  })
}

/** Open the Picker; resolves to the picked file, or null if cancelled. */
export async function showDrivePicker(accessToken: string): Promise<PickedFile | null> {
  const cfg = readDriveConfig()
  if (!cfg) throw new Error('Google Drive is not configured')
  await ensureLoaded()
  const g = window.google
  return new Promise<PickedFile | null>((resolve) => {
    const picker = new g.picker.PickerBuilder()
      .setAppId(cfg.appId)
      .setOAuthToken(accessToken)
      .setDeveloperKey(cfg.apiKey)
      .addView(new g.picker.DocsUploadView())
      .addView(new g.picker.DocsView().setIncludeFolders(false))
      .setCallback((data: any) => {
        const action = data[g.picker.Response.ACTION]
        if (action === g.picker.Action.PICKED) {
          resolve(parsePickerDoc(data[g.picker.Response.DOCUMENTS]?.[0] ?? null))
        } else if (action === g.picker.Action.CANCEL) {
          resolve(null)
        }
      })
      .build()
    picker.setVisible(true)
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/google/picker.ts
git commit -m "feat(portal): client Drive Picker + token loader"
```

---

### Task 7: Wire the Picker into `SubmitForm`

**Files:**
- Modify: `src/app/(prt)/assignments/SubmitForm.tsx`
- Modify: SubmitForm call sites (to pass `studentEmail`)

- [ ] **Step 1: Find the call sites**

Run: `grep -rn "SubmitForm" src/app` (expect `assignments/[id]/page.tsx`, possibly `classroom/[id]/classwork/page.tsx`). Each currently renders `<SubmitForm assignmentId={...} />`.

- [ ] **Step 2: Add the `studentEmail` prop at each call site**

For every `<SubmitForm assignmentId={a.id} />`, add `studentEmail={me.email}` (the page already loads the current user via `requireRole`/`getProfile`; use that object's `email`). Example:

```tsx
<SubmitForm assignmentId={a.id} studentEmail={me.email} />
```

- [ ] **Step 3: Replace `SubmitForm.tsx` with the dual-path version**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { submitLinkAction } from './submit-action'
import { useUI } from '../Providers'
import { checkDriveLink } from '@/lib/driveLink'
import { isPickerConfigured } from '@/lib/google/driveConfig'
import { getDriveAccessToken, showDrivePicker } from '@/lib/google/picker'
import { shareAnyoneWithLink } from '@/lib/google/driveShare'

export function SubmitForm({ assignmentId, studentEmail }: { assignmentId: string; studentEmail?: string }) {
  const [url, setUrl] = useState('')
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useUI()
  const linkCheck = checkDriveLink(url)
  const pickerOn = isPickerConfigured()

  function record(link: string, fileName?: string) {
    const fd = new FormData()
    fd.set('assignment_id', assignmentId)
    fd.set('url', link)
    if (fileName) fd.set('file_name', fileName)
    startTransition(async () => {
      try {
        await submitLinkAction(fd)
        setUrl('')
        toast('Submitted ✓', 'success')
      } catch (err) {
        const m = err instanceof Error ? err.message : 'Could not submit'
        setError(m)
        toast(m, 'error')
      }
    })
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const link = url.trim()
    if (!link) return
    setError(null)
    record(link)
  }

  async function onAttachFromDrive() {
    setError(null)
    setBusy(true)
    try {
      const token = await getDriveAccessToken(studentEmail)
      const picked = await showDrivePicker(token)
      if (!picked) return // cancelled
      try {
        await shareAnyoneWithLink(picked.id, token)
      } catch {
        toast('Uploaded — but please set sharing to “Anyone with the link” yourself', 'error')
      }
      record(picked.url, picked.name)
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Could not connect to Google Drive'
      setError(m)
      toast(m, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 space-y-2">
      {pickerOn && (
        <button
          type="button"
          onClick={onAttachFromDrive}
          disabled={busy || isPending}
          className="btn btn-primary btn-sm"
        >
          {busy ? 'Opening Drive…' : 'Attach from Drive'}
        </button>
      )}

      <details className="text-xs" open={!pickerOn}>
        {pickerOn && <summary className="cursor-pointer text-slate-500">or paste a link</summary>}
        <form onSubmit={onSubmit} className="mt-1.5 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste your Google Drive link…"
              required
              disabled={isPending}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
            <button disabled={isPending} className="btn btn-primary btn-sm">
              {isPending ? 'Submitting…' : 'Submit link'}
            </button>
          </div>
          {linkCheck === 'folder' && (
            <p className="text-xs text-amber-600">
              That looks like a Drive <span className="font-medium">folder</span> link — share the specific file so your tutor sees just your work.
            </p>
          )}
          {linkCheck === 'not-drive' && (
            <p className="text-xs text-amber-600">
              That doesn’t look like a Google Drive link. You can still submit it — just make sure it opens for your tutor, not only for you.
            </p>
          )}
          <p className="text-xs text-slate-400">
            Tip: in Drive, set sharing to <span className="font-medium text-slate-500">“Anyone with the link”</span>. To be sure, open your link in a private/incognito window — if it opens there, your tutor can see it.
          </p>
          <p className="text-xs text-slate-400">
            Naming your file <span className="font-medium text-slate-500">YYYY-MM-DD-topic</span> keeps it easy to find and stops a re-upload from overwriting an earlier version.
          </p>
          <p className="text-xs text-slate-400">
            The academy <span className="font-medium text-slate-500">links</span> to your file — it doesn’t keep a copy. Leave it in your Drive until the term ends.
          </p>
        </form>
      </details>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit && npx next build`
Expected: exit 0 for both. *(If `next build` errors on chunk cache, `rm -rf .next` and rebuild.)*

- [ ] **Step 5: Commit**

```bash
git add "src/app/(prt)/assignments/SubmitForm.tsx" "src/app/(prt)/assignments/[id]/page.tsx"
# plus any other call site touched in Step 2
git commit -m "feat(portal): Attach from Drive on the submit form (paste fallback kept)"
```

---

### Task 8: Setup docs

**Files:**
- Modify: `docs/setup_guide.md`

- [ ] **Step 1: Add a "Google Drive Picker (optional)" section**

Document the one-time Google Cloud steps and note it's optional:

```markdown
## Google Drive Picker for submissions (optional)

Lets students attach homework in one click (upload/pick → auto-share → submit),
using each student's own Drive as storage. Skip this and the portal keeps the
manual paste-a-link flow.

1. Create/borrow a **Google Cloud project** → note its **project number** (this is `NEXT_PUBLIC_GOOGLE_APP_ID`).
2. **APIs & Services → Enable APIs**: enable **Google Picker API** and **Google Drive API**.
3. **Credentials → API key** → restrict it to the **Picker API** and your site's HTTP referrers → `NEXT_PUBLIC_GOOGLE_API_KEY`.
4. **Credentials → OAuth client ID → Web application** → add your origin(s) to *Authorized JavaScript origins* → `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
5. **OAuth consent screen**: scope is `.../auth/drive.file` (non-sensitive — no verification review needed for internal use). Add your academy users, or publish.
6. Set the three `NEXT_PUBLIC_GOOGLE_*` vars in Vercel (and `.env.local` for a live test — the Picker does **not** run in mock mode).
```

- [ ] **Step 2: Commit**

```bash
git add docs/setup_guide.md
git commit -m "docs: Google Drive Picker setup steps"
```

---

### Task 9: Full verification + manual Picker checklist

- [ ] **Step 1: Full automated suite**

Run: `npx vitest run && npx tsc --noEmit && npx next build`
Expected: all unit tests pass (existing 89 + new ~15), tsc exit 0, build succeeds.

- [ ] **Step 2: Offline regression (mock mode)**

Run: `npx playwright test tests/e2e/journeys.pw.ts`
Expected: the student journey passes via the **paste fallback** (Picker hidden because `isPickerConfigured()` is false in mock).

- [ ] **Step 3: Manual Picker test (in a Google-configured env)**

With the three `NEXT_PUBLIC_GOOGLE_*` set and `NEXT_PUBLIC_MOCK_MODE` off, as a student:
- [ ] "Attach from Drive" appears; the paste path is behind "or paste a link".
- [ ] Clicking it prompts Google consent once (drive.file), pre-selecting the student's account.
- [ ] Upload a new 10–15 MB PDF via the Picker → it lands in the student's Drive.
- [ ] Submission is recorded with the filename; teacher can open the link (sharing was set automatically); on-time/late shows correctly.
- [ ] Cancelling the Picker records nothing.
- [ ] Revoke the app's Drive access in the Google account → re-attaching re-prompts consent.

- [ ] **Step 4: Final commit (if any docs/tweaks)**

```bash
git add -A
git commit -m "chore(portal): verify Drive Picker submissions end-to-end"
```

---

## Self-review notes
- **Spec coverage:** config gate (T1), Picker parse (T2), storage column (T3), action/schema (T4), auto-share (T5), client glue (T6), UI wiring + fallback (T7), setup docs (T8), verification (T9) — every spec section maps to a task.
- **Mock/offline preserved:** `isPickerConfigured()` is false without the env vars or in mock, so local dev + Playwright are untouched.
- **No new server secrets, no refresh token, no central storage** — matches the design's core constraint.
- **Backward compatible:** the paste path and `submitLinkAction` contract are unchanged (only an optional field added).

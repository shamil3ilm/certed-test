# Phase 0 — Foundation Implementation Plan

> **How to build this (no special model, plugin, or skill required).** This plan is fully self-contained. Build the tasks **in order**, top to bottom. For each task, follow the steps verbatim: write the test exactly as shown → run the exact command and confirm the expected FAIL → paste the implementation exactly as shown → re-run and confirm PASS → commit. Then check off each `- [ ]`. Do not reorder steps, skip the test-first order, or improvise — every command and code block is provided literally.

**Goal:** Stand up the spine: a user can sign in with Google, an allowlisted user reaches a role-aware empty dashboard at `app.certedacademia.com`, a non-allowlisted user is blocked, and the Drive token + folder bootstrap are proven — including resolving the resumable-upload CORS risk.

**Architecture:** One Next.js 14 app; root `middleware.ts` routes by hostname and refreshes the Supabase session; Supabase (Auth + Postgres + RLS) holds identity; server-only helpers hold the service-role key and the Google Drive refresh token.

**Tech Stack:** Next.js 14, TypeScript, Tailwind 4, `@supabase/supabase-js`, `@supabase/ssr`, `googleapis`, Zod, Vitest.

**Prereqted spec:** `docs/superpowers/specs/2026-06-25-cert-ed-academia-app-design.md`

---

## File map (created in this phase)

```
.env.example                      # documented secrets (no real values)
vitest.config.ts                  # unit/integration test runner
middleware.ts                     # hostname routing + session refresh
supabase/migrations/0001_foundation.sql
lib/routing/host.ts               # pure resolveHost() (TDD)
lib/supabase/{server,client,admin,middleware}.ts
lib/auth/{profile,guards}.ts      # getProfile + requireRole (TDD)
lib/drive/{auth,folders}.ts       # token + folder resolver (TDD)
lib/repos/orgSettings.ts
app/(app)/login/page.tsx
app/(app)/auth/callback/route.ts
app/(app)/dashboard/page.tsx
app/(app)/layout.tsx
app/api/cron/keepalive/route.ts
scripts/drive-consent.mjs         # one-time, local only
scripts/spike-resumable-cors.md   # spike instructions + result
vercel.json                       # cron schedule
```

---

## Task 0.1: Tooling, dependencies, env scaffolding

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `.env.example`, `vitest.setup.ts`

- [ ] **Step 1: Install runtime + dev dependencies**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr googleapis zod
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @types/node
```

- [ ] **Step 2: Add test scripts to `package.json`**

In `"scripts"` add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

- [ ] **Step 4: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 5: Create `.env.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only — never client

# Google Drive (institute "Drive owner" account)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_ROOT_FOLDER_ID=        # optional; auto-created if absent

# App
SEED_ADMIN_EMAIL=
APP_HOSTNAME=app.certedacademia.com
MARKETING_HOSTNAME=certedacademia.com
CRON_SECRET=                        # protects /api/cron/* 
```

- [ ] **Step 6: Verify the runner and build**

Run: `npm run test`
Expected: exits 0, "No test files found" (acceptable — none yet).
Run: `npm run build`
Expected: PASS (existing marketing site still builds).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts .env.example
git commit -m "chore: add supabase/drive deps, vitest, env scaffolding"
```

---

## Task 0.2: Supabase project + Google provider (config + verify)

> Manual cloud setup. No code, but a verification gate.

- [ ] **Step 1: Create the Supabase projects**

Create **two** free projects at https://supabase.com — `cert-ed-prod` and `cert-ed-preview` (spec §8: preview must not write prod data). For each, copy from Project Settings → API: Project URL, `anon` key, `service_role` key.

- [ ] **Step 2: Configure Google as an auth provider**

In Google Cloud Console create an OAuth 2.0 Client (Web). Set the OAuth consent screen to **"In production"** (spec §13 — Testing status expires Drive tokens in 7 days). Add the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI. In Supabase → Authentication → Providers → Google, paste the client id/secret and enable.

- [ ] **Step 3: Add redirect/site URLs**

Supabase → Authentication → URL Configuration: Site URL `https://app.certedacademia.com`; add `http://localhost:3000/**` and the Vercel preview pattern to Redirect URLs for local/preview login.

- [ ] **Step 4: Put prod keys in `.env.local`**

Create `.env.local` (git-ignored) with the `cert-ed-prod` URL + anon + service_role keys and `SEED_ADMIN_EMAIL=<your admin gmail>`.

- [ ] **Step 5: Verify connectivity**

Run:
```bash
node -e "fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/auth/v1/health',{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}}).then(r=>r.text()).then(t=>console.log('health:',t)).catch(e=>{console.error(e);process.exit(1)})" 
```
(Load env first, e.g. with `node --env-file=.env.local`.) Expected: a JSON health response, not an auth error.

- [ ] **Step 6: Commit** (nothing to commit — config only; record the project refs in a private note, not git.)

---

## Task 0.3: Migration — profiles, org_settings, role helper, RLS, seed admin

**Files:**
- Create: `supabase/migrations/0001_foundation.sql`
- Test: `tests/integration/rls-foundation.test.ts`

- [ ] **Step 1: Write the failing RLS integration test**

```ts
// tests/integration/rls-foundation.test.ts
import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

describe('profiles RLS', () => {
  const admin = createClient(url, service)            // bypasses RLS
  const anonClient = createClient(url, anon)          // RLS enforced, no session

  beforeAll(async () => {
    await admin.from('profiles').upsert({
      email: 'rls-seed@example.com', full_name: 'Seed', role: 'student', status: 'active',
    }, { onConflict: 'email' })
  })

  it('anonymous cannot read profiles', async () => {
    const { data, error } = await anonClient.from('profiles').select('*')
    expect(error ?? data?.length === 0).toBeTruthy()  // RLS returns 0 rows or error
  })

  it('service role can read profiles', async () => {
    const { data, error } = await admin.from('profiles').select('email').limit(1)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it — must fail (table missing)**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/rls-foundation.test.ts`
Expected: FAIL — relation "profiles" does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0001_foundation.sql
create type user_role as enum ('admin','teacher','student');
create type user_status as enum ('active','pending','disabled');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role user_role not null default 'student',
  status user_status not null default 'pending',
  class_level text,
  created_at timestamptz not null default now()
);
-- allow allowlisting before the user has ever logged in (no auth row yet):
alter table profiles alter column id drop not null;

create table org_settings (
  id boolean primary key default true,        -- single-row guard
  institute_name text not null default 'Cert-Ed Academia',
  contact_email text, contact_phone text,
  bank_account text, bank_ifsc text, bank_branch text,
  terms_text text,
  signatory_name text, signatory_title text,
  signature_mode text not null default 'text',
  signature_text text default 'Digitally signed',
  default_currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  receipt_prefix text not null default 'CEA-R',
  payslip_prefix text not null default 'CEA-P',
  constraint org_settings_single_row check (id)
);

-- role/status helper, SECURITY DEFINER so policies can read profiles safely
create or replace function current_role() returns user_role
language sql security definer stable set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;
create or replace function current_status() returns user_status
language sql security definer stable set search_path = public as $$
  select status from profiles where id = auth.uid()
$$;
create or replace function is_active_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role='admin' and status='active')
$$;

alter table profiles enable row level security;
alter table org_settings enable row level security;

-- a signed-in user can read their own profile; admins read all
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or is_active_admin());
-- a user may update only their own full_name; admins update anything
create policy profiles_self_update on profiles for update
  using (id = auth.uid() or is_active_admin());
create policy profiles_admin_write on profiles for all
  using (is_active_admin()) with check (is_active_admin());

create policy org_read on org_settings for select using (auth.uid() is not null);
create policy org_admin_write on org_settings for all
  using (is_active_admin()) with check (is_active_admin());

insert into org_settings (id) values (true) on conflict do nothing;
```

- [ ] **Step 4: Apply the migration**

Run (Supabase CLI linked to `cert-ed-prod`): `supabase db push`
(or paste the SQL into the Supabase SQL editor for the prod project.)
Expected: success, tables created.

- [ ] **Step 5: Seed the first admin**

Run:
```bash
node --env-file=.env.local -e "import('@supabase/supabase-js').then(async ({createClient})=>{const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const {error}=await c.from('profiles').upsert({email:process.env.SEED_ADMIN_EMAIL,full_name:'Admin',role:'admin',status:'active'},{onConflict:'email'});console.log(error??'seeded admin')})"
```
Expected: `seeded admin`.

- [ ] **Step 6: Run the RLS test — must pass**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/rls-foundation.test.ts`
Expected: PASS (anon blocked, service role reads).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0001_foundation.sql tests/integration/rls-foundation.test.ts
git commit -m "feat: foundation schema (profiles, org_settings, role helpers, RLS)"
```

---

## Task 0.4: Supabase client helpers

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`, `lib/supabase/middleware.ts`

- [ ] **Step 1: Browser client** — `lib/supabase/client.ts`

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 2: Server client (RLS, user session)** — `lib/supabase/server.ts`

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch { /* called from a Server Component — middleware refreshes instead */ }
        },
      },
    },
  )
}
```

- [ ] **Step 3: Service-role admin client (server only)** — `lib/supabase/admin.ts`

```ts
import 'server-only'
import { createClient as createSb } from '@supabase/supabase-js'

export function createAdminClient() {
  return createSb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```

- [ ] **Step 4: Middleware session refresher** — `lib/supabase/middleware.ts`

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
```

- [ ] **Step 5: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase
git commit -m "feat: supabase client helpers (browser/server/admin/middleware)"
```

---

## Task 0.5: Login page + auth callback

**Files:**
- Create: `app/(app)/login/page.tsx`, `app/(app)/auth/callback/route.ts`, `app/(app)/layout.tsx`

- [ ] **Step 1: App route-group layout** — `app/(app)/layout.tsx`

```tsx
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-900">{children}</div>
}
```

- [ ] **Step 2: Login page** — `app/(app)/login/page.tsx`

```tsx
'use client'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const signIn = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }
  return (
    <main className="grid min-h-screen place-items-center">
      <button onClick={signIn} className="rounded-lg border px-6 py-3 font-medium shadow-sm">
        Sign in with Google
      </button>
    </main>
  )
}
```

- [ ] **Step 3: Callback route** — `app/(app)/auth/callback/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(`${origin}/dashboard`)
}
```

- [ ] **Step 4: Manual verify** — Run `npm run dev`, visit `http://localhost:3000/login`, sign in with the seeded admin Google account. Expected: redirected to `/dashboard` (which 404s until Task 0.8 — acceptable here).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/login" "app/(app)/auth" "app/(app)/layout.tsx"
git commit -m "feat: google login + auth callback"
```

---

## Task 0.6: Profile loader + requireRole guard (TDD)

**Files:**
- Create: `lib/auth/profile.ts`, `lib/auth/guards.ts`
- Test: `tests/unit/guards.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/guards.test.ts
import { describe, it, expect, vi } from 'vitest'
import { assertRole } from '@/lib/auth/guards'

const p = (role: string, status = 'active') => ({ id: '1', email: 'a@b.c', role, status }) as any

describe('assertRole', () => {
  it('passes when role is allowed and active', () => {
    expect(() => assertRole(p('teacher'), ['teacher', 'admin'])).not.toThrow()
  })
  it('throws for disallowed role', () => {
    expect(() => assertRole(p('student'), ['teacher', 'admin'])).toThrow('forbidden')
  })
  it('throws for disabled user even with right role', () => {
    expect(() => assertRole(p('admin', 'disabled'), ['admin'])).toThrow('revoked')
  })
  it('throws when no profile (not allowlisted)', () => {
    expect(() => assertRole(null, ['student'])).toThrow('no-access')
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/guards.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement** — `lib/auth/guards.ts`

```ts
import type { Profile } from './profile'

export function assertRole(profile: Profile | null, allowed: Profile['role'][]): Profile {
  if (!profile) throw new Error('no-access')
  if (profile.status === 'disabled') throw new Error('revoked')
  if (profile.status !== 'active') throw new Error('no-access')
  if (!allowed.includes(profile.role)) throw new Error('forbidden')
  return profile
}
```

`lib/auth/profile.ts`:

```ts
import { createClient } from '@/lib/supabase/server'

export type Profile = {
  id: string; email: string; full_name: string | null
  role: 'admin' | 'teacher' | 'student'
  status: 'active' | 'pending' | 'disabled'
  class_level: string | null
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  return (data as Profile) ?? null
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/guards.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth tests/unit/guards.test.ts
git commit -m "feat: profile loader + assertRole guard"
```

---

## Task 0.7: Hostname routing (TDD) + middleware

**Files:**
- Create: `lib/routing/host.ts`, `middleware.ts`
- Test: `tests/unit/host.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/host.test.ts
import { describe, it, expect } from 'vitest'
import { resolveHost } from '@/lib/routing/host'

describe('resolveHost', () => {
  it('maps the app subdomain', () => {
    expect(resolveHost('app.certedacademia.com')).toBe('app')
    expect(resolveHost('app.localhost:3000')).toBe('app')
  })
  it('maps the marketing apex/www', () => {
    expect(resolveHost('certedacademia.com')).toBe('marketing')
    expect(resolveHost('www.certedacademia.com')).toBe('marketing')
  })
  it('treats bare localhost as app in dev', () => {
    expect(resolveHost('localhost:3000')).toBe('app')
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/host.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** — `lib/routing/host.ts`

```ts
export type HostKind = 'app' | 'marketing'

export function resolveHost(hostHeader: string | null | undefined): HostKind {
  const host = (hostHeader ?? '').toLowerCase().split(':')[0]
  if (host.startsWith('app.')) return 'app'
  if (host === 'localhost' || host === '127.0.0.1') return 'app' // dev default
  return 'marketing'
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/host.test.ts` — Expected: PASS.

- [ ] **Step 5: Implement `middleware.ts`** (uses the pure resolver + session)

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { resolveHost } from '@/lib/routing/host'
import { updateSession } from '@/lib/supabase/middleware'

const MARKETING_PATHS = ['/', '/about', '/blogs', '/classes', '/contact']
const PUBLIC_APP_PATHS = ['/login', '/auth/callback', '/access-pending', '/access-revoked']

export async function middleware(request: NextRequest) {
  const kind = resolveHost(request.headers.get('host'))
  const { pathname } = request.nextUrl
  const response = NextResponse.next()

  if (kind === 'marketing') {
    // app-only paths don't belong on the marketing host
    if (!MARKETING_PATHS.some(p => pathname === p || pathname.startsWith('/blogs/'))) {
      return NextResponse.redirect(new URL(`https://${process.env.APP_HOSTNAME}${pathname}`, request.url))
    }
    return response
  }

  // app host: refresh session, then gate
  const user = await updateSession(request, response)
  if (PUBLIC_APP_PATHS.some(p => pathname.startsWith(p))) return response
  if (!user) return NextResponse.redirect(new URL('/login', request.url))
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|.*\\..*).*)'],
}
```

> Role/allowlist checks (pending/revoked) are enforced per-page via `getProfile()` + `assertRole()` (Task 0.6/0.8); middleware only enforces "is signed in".

- [ ] **Step 6: Commit**

```bash
git add lib/routing/host.ts middleware.ts tests/unit/host.test.ts
git commit -m "feat: hostname routing + auth middleware"
```

---

## Task 0.8: Role-aware dashboard shell + access screens

**Files:**
- Create: `app/(app)/dashboard/page.tsx`, `app/(app)/access-pending/page.tsx`, `app/(app)/access-revoked/page.tsx`

- [ ] **Step 1: Access screens**

`app/(app)/access-pending/page.tsx`:
```tsx
export default function Page() {
  return <main className="grid min-h-screen place-items-center p-8 text-center">
    <p>Your access is pending. Please contact the academy to be added.</p>
  </main>
}
```
`app/(app)/access-revoked/page.tsx`:
```tsx
export default function Page() {
  return <main className="grid min-h-screen place-items-center p-8 text-center">
    <p>Your access has been revoked. Contact the academy if this is a mistake.</p>
  </main>
}
```

- [ ] **Step 2: Dashboard shell** — `app/(app)/dashboard/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'

export default async function Dashboard() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">Welcome, {profile.full_name ?? profile.email}</h1>
      <p className="mt-1 text-slate-500">Role: {profile.role}</p>
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {/* placeholders wired up in later phases */}
        {(profile.role === 'admin' ? ['Users', 'Courses', 'Finance']
          : profile.role === 'teacher' ? ['Announcements', 'Resources', 'Assignments']
          : ['Announcements', 'Assignments', 'Receipts']).map((c) => (
          <div key={c} className="rounded-xl border bg-white p-6 shadow-sm">{c}</div>
        ))}
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Manual verify** — `npm run dev`, sign in as seeded admin → see "Role: admin" with admin cards. Temporarily set your profile `status='disabled'` via the Supabase table editor → reload → redirected to `/access-revoked`. Restore to `active`.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard" "app/(app)/access-pending" "app/(app)/access-revoked"
git commit -m "feat: role-aware dashboard shell + access screens"
```

---

## Task 0.9: Drive one-time consent script (local) → refresh token

**Files:**
- Create: `scripts/drive-consent.mjs`

- [ ] **Step 1: Write the script**

```js
// scripts/drive-consent.mjs — run locally ONCE to mint GOOGLE_REFRESH_TOKEN
import { google } from 'googleapis'
import http from 'node:http'

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:5555/oauth2callback',
)
const url = oauth2.generateAuthUrl({
  access_type: 'offline', prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file'],
})
console.log('\nOpen this URL while signed in as the institute Drive owner:\n', url, '\n')

http.createServer(async (req, res) => {
  if (!req.url.startsWith('/oauth2callback')) { res.end('ignored'); return }
  const code = new URL(req.url, 'http://localhost:5555').searchParams.get('code')
  const { tokens } = await oauth2.getToken(code)
  console.log('\nGOOGLE_REFRESH_TOKEN=', tokens.refresh_token, '\n')
  res.end('Done — copy the refresh token from your terminal. You can close this tab.')
  process.exit(0)
}).listen(5555, () => console.log('Listening on http://localhost:5555 ...'))
```

- [ ] **Step 2: Run it** (add `http://localhost:5555/oauth2callback` to the Google OAuth client's redirect URIs first)

Run: `node --env-file=.env.local scripts/drive-consent.mjs`
Open the printed URL, consent as the **institute Drive owner** account, copy the printed refresh token into `.env.local` as `GOOGLE_REFRESH_TOKEN=`.
Expected: a non-empty refresh token.

- [ ] **Step 3: Commit** (script only — token stays in `.env.local`)

```bash
git add scripts/drive-consent.mjs
git commit -m "chore: one-time Drive consent script"
```

---

## Task 0.10: Drive token client + folder resolver (TDD)

**Files:**
- Create: `lib/drive/auth.ts`, `lib/drive/folders.ts`
- Test: `tests/unit/drive-folders.test.ts`

- [ ] **Step 1: Write the failing test** (mock the Drive API surface)

```ts
// tests/unit/drive-folders.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ensureChildFolder } from '@/lib/drive/folders'

function fakeDrive(existing: Record<string, string> = {}) {
  const created: any[] = []
  return {
    created,
    files: {
      list: vi.fn(async ({ q }: any) => {
        const name = /name = '([^']+)'/.exec(q)?.[1]
        const id = name ? existing[name] : undefined
        return { data: { files: id ? [{ id, name }] : [] } }
      }),
      create: vi.fn(async ({ requestBody }: any) => {
        const id = 'new-' + requestBody.name
        created.push(requestBody)
        return { data: { id } }
      }),
    },
  } as any
}

describe('ensureChildFolder', () => {
  it('returns the existing folder id without creating', async () => {
    const drive = fakeDrive({ Resources: 'fld-1' })
    const id = await ensureChildFolder(drive, 'parent-0', 'Resources')
    expect(id).toBe('fld-1')
    expect(drive.files.create).not.toHaveBeenCalled()
  })
  it('creates the folder when missing', async () => {
    const drive = fakeDrive()
    const id = await ensureChildFolder(drive, 'parent-0', 'Assignments')
    expect(id).toBe('new-Assignments')
    expect(drive.created[0]).toMatchObject({ name: 'Assignments', parents: ['parent-0'] })
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/drive-folders.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/drive/auth.ts`:
```ts
import 'server-only'
import { google } from 'googleapis'

let cached: { token: string; exp: number } | null = null

export async function getDriveClient() {
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: oauth2 })
}
```

`lib/drive/folders.ts`:
```ts
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export async function ensureChildFolder(drive: any, parentId: string, name: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'")
  const { data } = await drive.files.list({
    q: `name = '${safe}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id,name)', spaces: 'drive',
  })
  if (data.files?.[0]?.id) return data.files[0].id
  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] }, fields: 'id',
  })
  return created.data.id
}

// Walk/create a path under the configured root; callers cache the leaf id in `drive_folders`.
export async function ensureFolderPath(drive: any, rootId: string, segments: string[]): Promise<string> {
  let parent = rootId
  for (const seg of segments) parent = await ensureChildFolder(drive, parent, seg)
  return parent
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/drive-folders.test.ts` — Expected: PASS.

- [ ] **Step 5: Smoke-test live folder bootstrap** (creates the top folder in the real Drive)

Run:
```bash
node --env-file=.env.local -e "import('./lib/drive/auth.ts')" 2>/dev/null || echo "use a tiny ts runner or move smoke test into a route"
```
(If running TS directly is awkward, defer the live smoke to Task 0.12's spike page, which exercises the same client.)

- [ ] **Step 6: Commit**

```bash
git add lib/drive tests/unit/drive-folders.test.ts
git commit -m "feat: drive token client + folder resolver"
```

---

## Task 0.11: org_settings repository + read

**Files:**
- Create: `lib/repos/orgSettings.ts`
- Test: `tests/unit/orgSettings.shape.test.ts`

- [ ] **Step 1: Write the failing test** (shape/derivation only — DB mocked)

```ts
// tests/unit/orgSettings.shape.test.ts
import { describe, it, expect } from 'vitest'
import { receiptNumber } from '@/lib/repos/orgSettings'

describe('receiptNumber', () => {
  it('formats prefix-year-padded', () => {
    expect(receiptNumber('CEA-R', 2026, 7)).toBe('CEA-R-2026-0007')
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/orgSettings.shape.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** — `lib/repos/orgSettings.ts`

```ts
import { createClient } from '@/lib/supabase/server'

export type OrgSettings = {
  institute_name: string; contact_email: string | null; contact_phone: string | null
  bank_account: string | null; bank_ifsc: string | null; bank_branch: string | null
  terms_text: string | null; signatory_name: string | null; signatory_title: string | null
  signature_mode: 'text' | 'image'; signature_text: string | null
  default_currency: string; timezone: string; receipt_prefix: string; payslip_prefix: string
}

export async function getOrgSettings(): Promise<OrgSettings> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('org_settings').select('*').single()
  if (error) throw new Error(`org_settings: ${error.message}`)
  return data as OrgSettings
}

export function receiptNumber(prefix: string, year: number, n: number): string {
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/orgSettings.shape.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/repos/orgSettings.ts tests/unit/orgSettings.shape.test.ts
git commit -m "feat: org_settings repo + receipt number formatter"
```

---

## Task 0.12: Drive resumable-upload CORS spike (RISK GATE)

> Decision gate from spec §4.4/§13. Resolve before Phase 2 builds on resumable uploads.

**Files:**
- Create: `scripts/spike-resumable-cors.md`, `app/api/spike/init/route.ts`, `app/(app)/spike/page.tsx`

- [ ] **Step 1: Init route — opens a resumable session, returns only the session URI**

```ts
// app/api/spike/init/route.ts
import { NextResponse } from 'next/server'
import { getDriveClient } from '@/lib/drive/auth'
import { ensureFolderPath } from '@/lib/drive/folders'

export async function POST(req: Request) {
  const { name, mimeType } = await req.json()
  const drive = await getDriveClient()
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
    ?? await ensureFolderPath(drive, 'root', ['Cert-Ed Academia'])
  // open a resumable session via raw fetch so we get the Location header
  const token = await (drive.context._options.auth as any).getAccessToken()
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.token ?? token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType, parents: [rootId] }),
  })
  const sessionUri = res.headers.get('location')
  return NextResponse.json({ sessionUri })
}
```

- [ ] **Step 2: Spike page — attempts the cross-origin PUT from the app origin**

```tsx
// app/(app)/spike/page.tsx
'use client'
import { useState } from 'react'

export default function Spike() {
  const [log, setLog] = useState('')
  const run = async (file: File) => {
    const init = await fetch('/api/spike/init', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, mimeType: file.type || 'application/octet-stream' }),
    }).then(r => r.json())
    try {
      const put = await fetch(init.sessionUri, { method: 'PUT', body: file })
      setLog(`PUT ${put.status} — CORS OK ✅ fileId in response`)
    } catch (e: any) {
      setLog(`PUT failed (likely CORS) ❌ ${e.message} — use Supabase-staging fallback`)
    }
  }
  return <main className="p-8">
    <input type="file" onChange={e => e.target.files?.[0] && run(e.target.files[0])} />
    <pre className="mt-4">{log}</pre>
  </main>
}
```

- [ ] **Step 3: Run the spike on a real preview origin**

Deploy to a Vercel preview (env vars set) or use a tunnel so the origin is a real `https://` host (not localhost). Visit `/spike`, upload a small file.
Expected one of:
- **✅ CORS OK** → keep the spec's direct browser→Drive resumable plan for Phase 2.
- **❌ CORS blocked** → switch Phase 2 to the **Supabase-Storage-staging fallback** (browser→Supabase signed upload → server copies to Drive). Record this in the spike doc.

- [ ] **Step 4: Record the result** — write the outcome + chosen path into `scripts/spike-resumable-cors.md`.

- [ ] **Step 5: Remove the spike code, keep the doc**

```bash
git rm -r "app/api/spike" "app/(app)/spike"
git add scripts/spike-resumable-cors.md
git commit -m "chore: resolve drive resumable CORS spike (see doc for outcome)"
```

---

## Task 0.13: Vercel Cron keep-alive

**Files:**
- Create: `vercel.json`, `app/api/cron/keepalive/route.ts`

- [ ] **Step 1: Keepalive route** (pings Supabase so the free project doesn't pause)

```ts
// app/api/cron/keepalive/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const { error } = await supabase.from('org_settings').select('id').limit(1)
  return NextResponse.json({ success: !error })
}
```

- [ ] **Step 2: Schedule** — `vercel.json`

```json
{ "crons": [{ "path": "/api/cron/keepalive", "schedule": "0 6 * * *" }] }
```

> Set `CRON_SECRET` in Vercel; Vercel Cron sends it automatically when configured, or protect via the same header.

- [ ] **Step 3: Commit**

```bash
git add vercel.json "app/api/cron/keepalive"
git commit -m "chore: daily supabase keep-alive cron"
```

---

## Phase 0 Acceptance Criteria
- [ ] `npm run test` green (host, guards, drive-folders, orgSettings unit tests + RLS integration test).
- [ ] Seeded admin signs in with Google and lands on a role-aware dashboard; a non-allowlisted Google account is redirected to `/access-pending`; a `disabled` profile is redirected to `/access-revoked`.
- [ ] Marketing host still serves the existing site; app-only paths on the marketing host redirect to the app subdomain.
- [ ] `GOOGLE_REFRESH_TOKEN` minted; folder resolver unit-tested; top-level Drive folder creatable.
- [ ] **Resumable-CORS spike resolved** and the Phase 2 upload path (direct vs Supabase-staging) is decided and recorded.
- [ ] Keep-alive cron scheduled.

## Self-review notes (done)
- Spec coverage: §4.0 backend, §4.1 routing, §4.2 auth+allowlist, §4.3 Drive token/folders, §4.4 upload spike, §5 profiles/org_settings + RLS, §7.1 onboarding/pending/revoked — all mapped to tasks above.
- Type consistency: `Profile`, `OrgSettings`, `resolveHost`, `assertRole`, `ensureChildFolder`/`ensureFolderPath`, `receiptNumber` are defined once and referenced consistently.
- No placeholders: every code step includes runnable code; config steps include exact commands + expected output.

# Mock Mode — run & test the portal locally with **no** Supabase or Google

Mock mode lets you run the **entire Cert‑Ed Academia portal** on your machine
with zero external services: no Supabase project, no Google OAuth, no Google
Drive. It swaps the data layer for an in‑memory + JSON‑file fake, the login for a
one‑click role picker, and Google Drive / PDF for local‑filesystem storage.

> ⚠️ **Dev‑only, lower fidelity.** Mock mode does **not** enforce row‑level
> security (RLS) and does **not** render PDFs with Chromium. It is for clicking
> through the UI and flows — **not** a substitute for the real RLS/integration
> tests. It is fully gated behind `MOCK_MODE=1`; production is unaffected.

---

## 1. Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:3000/login** (or whatever port `next dev` prints)
and pick a role.

That's it — `.env.local` already ships with the mock settings (see §3). If the
portal redirects you to a "Sign in with Google" button instead of the role
picker, mock mode is off — check `.env.local`.

---

## 2. Signing in (dev login)

The login page shows three buttons. Each signs you in as a seeded user by
setting a `mock_uid` cookie — no password, no OAuth.

| Role    | Name          | Email               | Sees                                            |
|---------|---------------|---------------------|-------------------------------------------------|
| Admin   | Asha Admin    | admin@mock.test     | Everything: users, courses, finance, calendar   |
| Teacher | Tarun Teacher | teacher@mock.test   | Their 2 courses, announcements, assignments, **pay slips**, calendar mgmt |
| Student | Sara Student  | student@mock.test   | Enrolled courses, assignments, **receipts**, calendar |

Switch roles any time: go to **`/api/dev/logout`** (clears the cookie) then pick
another role, or just hit `/api/dev/login?role=teacher` directly.

---

## 3. What `.env.local` does

```ini
MOCK_MODE=1                 # turns the whole fake on (server)
NEXT_PUBLIC_MOCK_MODE=1     # tells the login page to show the role picker (client)

# Sentinel values so the env-guards treat the portal as "configured".
# Never used to reach a real server in mock mode.
NEXT_PUBLIC_SUPABASE_URL=http://mock.local
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=mock-publishable-key
SUPABASE_SECRET_KEY=mock-secret-key

APP_HOSTNAME=app.certedacademia.com
MARKETING_HOSTNAME=certedacademia.com
CRON_SECRET=mock-cron
```

`.env.local` is git‑ignored, so it never gets committed.

---

## 4. What you can do (and it actually works)

| Area            | Works in mock mode                                                             |
|-----------------|--------------------------------------------------------------------------------|
| **Auth**        | Dev login as admin / teacher / student; role‑based dashboards & redirects      |
| **Admin**       | List users & courses; data shows seeded rows                                   |
| **Announcements** | Create (admin/teacher) → appears in the list                                 |
| **Resources**   | List; **upload a file** (bytes saved to `.mock-storage/`) → **download** it back |
| **Assignments** | List + detail; **student submits a file** → teacher sees the submission        |
| **Finance**     | **Issue** a fee receipt / pay slip → number auto‑increments, **PDF** generated, **download** it; **void**; **CSV export** |
| **Calendar**    | Month⇄week view in your device timezone; **create weekly slots & events**; due dates overlay |

Writes **persist** across restarts (see §5). Uploaded files and generated PDFs
are real, openable files on disk.

> **Note on PDFs:** Chromium can't run locally on Windows, so finance PDFs are a
> minimal placeholder PDF (a real, openable file showing the document title),
> not the full styled template. The styled HTML→PDF runs only on the real
> deployment.

---

## 5. Where the data lives (and how to reset)

| Path                | What                                                              |
|---------------------|------------------------------------------------------------------|
| `.mock-db.json`     | The whole database as JSON. Seeded on first run; rewritten on every insert/update. **You can open & edit it.** |
| `.mock-storage/`    | Uploaded files + generated PDFs (`<id>` + `<id>.json` metadata).  |

Both are git‑ignored.

**Reset to the seed:** stop the server, delete `.mock-db.json` and
`.mock-storage/`, start again — they're recreated from the seed.

```bash
rm -f .mock-db.json && rm -rf .mock-storage
```

To change the starting data, edit the seed in
[`src/lib/mock/seed.ts`](../src/lib/mock/seed.ts) and reset.

---

## 6. Turning mock mode off / going to real Supabase

Set `MOCK_MODE=0` (or remove it and `NEXT_PUBLIC_MOCK_MODE`) and fill in real
Supabase + Google values in `.env.local`. With `MOCK_MODE` unset and no real
Supabase URL, the portal goes **dormant** and only the marketing site serves —
exactly the production‑safe default. See `.env.example` for the full real‑mode
variable list.

---

## 7. How it works (architecture)

Every integration point checks `isMock()` and falls back to the real path when
it's off. The fake never enforces RLS — it returns seeded rows filtered only by
the explicit `.eq()`/`.in()`/range predicates a repository chains.

```
src/lib/mock/
  env.ts          isMock()  — the single MOCK_MODE flag
  seed.ts         buildSeed() — all tables, seeded rows, stable IDs
  store.ts        JSON-file-backed store (.mock-db.json), load/persist
  queryBuilder.ts chainable, thenable supabase-js stand-in (select/insert/update/delete/upsert + filters)
  client.ts       createMockClient() — from() / rpc() / auth.getUser()
  session.ts      mock_uid cookie read (RSC + middleware)
  storage.ts      .mock-storage/ filesystem store + minimal-PDF generator

Wired (guarded by isMock()) into:
  src/lib/supabase/server.ts      createClient()        → mock server client
  src/lib/supabase/admin.ts       createAdminClient()   → mock admin client
  src/lib/supabase/middleware.ts  updateSession()       → reads mock cookie
  src/lib/pdf/renderPdf.ts        htmlToPdf()           → minimal placeholder PDF

Dev-only routes (404 unless MOCK_MODE):
  src/app/api/dev/login           sets the role cookie, redirects to /dashboard
  src/app/api/dev/logout          clears the cookie

Login UI:
  src/app/(prt)/login/page.tsx    shows the role picker when NEXT_PUBLIC_MOCK_MODE=1
```

### RPCs the fake implements
`next_document_number` (atomic receipt/pay‑slip counter), `teaches_class`,
`is_enrolled` — mirroring the Postgres functions used by the real RLS.

---

## 8. Fidelity & safety caveats

- **No RLS.** Scoping you see comes only from explicit query filters, not from
  row‑level security. Do **not** treat mock mode as a security test.
- **PDFs are placeholders**, not the Chromium‑rendered template.
- **Production is unaffected:** all mock code is behind `isMock()`, the dev
  routes 404 without `MOCK_MODE`, and `.env.local` / `.mock-db.json` /
  `.mock-storage/` are git‑ignored. `tsc`, the 90 unit tests, and `next build`
  all pass with the harness present.

# Setup Guide

Cert-Ed Academia needs only **one** external service to go live: **Supabase**
(Postgres + Auth). Google is used only as a **sign-in provider**, configured
inside Supabase — the app itself holds no Google API credentials.

**Files are Google Drive _links_, not uploads.** Tutors and students paste a
public "Anyone with the link" Google Drive URL for resources, assignment briefs,
and submissions; the app stores and opens the link. In this default setup there
is **no** Google Drive API or `googleapis` dependency to configure. *(An optional
Drive Picker — Part 3 — adds client-side Google keys, but still no server-side
Google credentials or refresh token.)*

---

## Local development (no services needed)

For local work, run in **mock mode** — a JSON-file fake of Supabase, so nothing
external is required. In `.env.local`:

```bash
MOCK_MODE=1
NEXT_PUBLIC_MOCK_MODE=1
NEXT_PUBLIC_SUPABASE_URL=http://mock.local   # sentinel so the portal is "configured"
APP_HOSTNAME=app.certedacademia.com
MARKETING_HOSTNAME=certedacademia.com
# MOCK_PASSWORD=cert-ed          # optional; shared password for the seeded demo users
# MOCK_CHROME_PATH=C:\path\chrome.exe   # optional; Chrome for finance-PDF rendering
```

Then `npm run dev`. Sign in at `/login` with a demo account (e.g.
`admin@mock.test` / `cert-ed`). The mock DB reseeds if you delete `.mock-db.json`.

---

## Part 1 — Supabase project

1. [supabase.com](https://supabase.com) → **New project** (create one per
   environment, e.g. `cert-ed-prod` and `cert-ed-preview`).
2. **Project Settings → API** — copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `Publishable` key (new `sb_publishable_…` format; legacy `anon` `eyJ…` also works) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `Secret` key (new `sb_secret_…` format; legacy `service_role` `eyJ…` also works) → `SUPABASE_SECRET_KEY` *(server only, never expose)*
3. **SQL Editor** (or `supabase db push`) — apply the migrations in order:
   run `0001` through `0006` from `supabase/migrations/`.
4. Seed the first admin (everything else is managed in-app via the Users hub):

```bash
node --env-file=.env.local -e "
import('@supabase/supabase-js').then(async ({ createClient }) => {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
  const { error } = await c.from('profiles').upsert(
    { email: process.env.SEED_ADMIN_EMAIL, full_name: 'Admin', role: 'admin', status: 'active' },
    { onConflict: 'email' },
  )
  console.log(error ?? 'Admin seeded')
})"
```

Access is **allowlist-only**: a user can sign in only if an admin has already
created their `profiles` row (matched by email; bound to their Google identity
on first login).

---

## Part 2 — Google sign-in

Google is only an OAuth **login provider** — the credentials live in Supabase,
not in the app.

1. [console.cloud.google.com](https://console.cloud.google.com/) → **New Project**.
2. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - **Authorised redirect URI:** `https://<supabase-project-ref>.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client Secret**.
3. **APIs & Services → OAuth consent screen** — set the app name / support email,
   then **Publish App** (in "Testing" mode only whitelisted Google accounts can sign in).
   No special scopes are needed — default email/profile is enough.
4. In Supabase → **Authentication → Providers → Google** → Enable, paste the
   Client ID + Secret.
5. Supabase → **Authentication → URL Configuration:**
   - Site URL: `https://app.certedacademia.com`
   - Redirect URLs: your production + preview domains.

---

## Part 3 — Files & live classes (Google Drive / Meet links)

No API setup — everything is a pasted link:

| Feature | How it works |
|---|---|
| **Resources / assignment briefs** | Tutor pastes a Google Drive **share link** (set sharing to *"Anyone with the link"*). Students click **Open Link**. |
| **Submissions** | Student pastes a Drive link to their work; the tutor opens it from the review page. |
| **Live classes** | Tutor/Admin creates a Google Meet at [meet.google.com](https://meet.google.com), copies the link, and adds it under **Class meet** (per class) or **Academy-wide** (admin). |

*(Auto-generating Meet links via the Google Calendar API is a possible future
enhancement, not part of the current app.)*

### Optional: one-click uploads via the Google Drive Picker

By default, submissions are pasted links (above). You can optionally add an
**"Attach from Drive"** button so students upload in one click to their *own*
Drive (no central storage; the app links to the file). One-time Google Cloud setup:

1. **Google Cloud project** → note its **project number** → `NEXT_PUBLIC_GOOGLE_APP_ID`.
2. **APIs & Services → Enable APIs:** enable **Google Picker API** and **Google Drive API**.
3. **Credentials → API key** → restrict to the **Picker API** + your site's HTTP referrers → `NEXT_PUBLIC_GOOGLE_API_KEY`.
4. **Credentials → OAuth client ID → Web application** → add your origin(s) to *Authorized JavaScript origins* → `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
5. **OAuth consent screen:** the only scope is `.../auth/drive.file` (non-sensitive — the app touches only files it creates; no verification review needed for internal use). Publish, or add your users as testers.
6. Set the three `NEXT_PUBLIC_GOOGLE_*` vars in Vercel; leave them unset to keep paste-only. The Picker never runs in mock mode.

Files stay in each student's Drive — the deliberate initial-phase choice. Central
storage (academy Drive API or object storage) can replace it later without
changing the submissions model. See
`docs/superpowers/specs/2026-07-10-drive-picker-submissions-design.md`.

---

## Part 4 — Contact form (optional)

The marketing contact form posts to a Google Apps Script web app. If you use it,
set `GOOGLE_SCRIPT_URL` to the deployed script URL; otherwise the endpoint
returns a friendly "not configured" response.

---

## Part 5 — Environment variables checklist

Mirror these to Vercel (production + preview):

```bash
# ── Supabase ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # or legacy anon eyJ...
SUPABASE_SECRET_KEY=sb_secret_...           # server only

# ── App host routing ──────────────────────────────────────────────────────────
APP_HOSTNAME=app.certedacademia.com
MARKETING_HOSTNAME=certedacademia.com

# ── Ops ───────────────────────────────────────────────────────────────────────
CRON_SECRET=a-long-random-string           # protects /api/cron/*
SEED_ADMIN_EMAIL=admin@yourdomain.com      # used only by the seed command above
# GOOGLE_SCRIPT_URL=https://script.google.com/...   # optional — marketing contact form

# ── Google Drive Picker (optional — client-side; see Part 3) ──────────────────
# NEXT_PUBLIC_GOOGLE_CLIENT_ID=
# NEXT_PUBLIC_GOOGLE_API_KEY=
# NEXT_PUBLIC_GOOGLE_APP_ID=
```

There are **no** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
`GOOGLE_REFRESH_TOKEN` variables — Google sign-in is configured entirely inside
Supabase, and there is no server-side Google API access.

---

## Summary of what's implemented

| Feature | Status |
|---|---|
| Allowlist auth (Google sign-in, first-login binding) | ✅ |
| Classes with Stream / Classwork / People; admin-owned lifecycle | ✅ |
| Many-to-many tutor↔student mentorships + mentee overview | ✅ |
| Assignments + Drive-link submissions (on-time/late) | ✅ |
| Resources + announcements + meet links (per-class **and** academy-wide) | ✅ |
| Comment threads (submissions / resources / meets) | ✅ |
| Finance: receipts + pay slips, PDF on demand | ✅ |
| Calendar + recurring timetable | ✅ |
| Reminders, dashboards, settings | ✅ |

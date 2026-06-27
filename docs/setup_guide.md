# External Services Setup Guide

This document covers every external service you need to configure before going live:
Google Drive (file storage for resources and submissions) and Google Meet (live classes).

---

## Part 1 — Google Cloud Project (One-time)

> Do this first. Both Drive and Meet use the same GCP project / OAuth client.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) → **New Project** → name it `cert-ed-academia`.
2. Enable APIs:
   - **Google Drive API** — `APIs & Services → Library → Google Drive API → Enable`
   - **Google Calendar API** *(needed later if you auto-create Meet links via Calendar)* → Enable
3. Create OAuth credentials:
   - `APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID`
   - Application type: **Web application**
   - Name: `Cert-Ed App`
   - **Authorised JavaScript origins:**
     ```
     https://app.certedacademia.com
     http://localhost:3000
     ```
   - **Authorised redirect URIs:**
     ```
     https://<supabase-project-ref>.supabase.co/auth/v1/callback
     http://localhost:5555/oauth2callback
     ```
   - Click **Create** → copy **Client ID** and **Client Secret** → save in `.env.local`

---

## Part 2 — OAuth Consent Screen (Critical)

> If left in "Testing" mode, Google expires the Drive refresh token **every 7 days**.

1. `APIs & Services → OAuth consent screen`
2. Fill in: App name = `Cert-Ed Academia`, Support email, Developer contact email.
3. Scopes → Add:
   - `https://www.googleapis.com/auth/drive.file` *(only files the app creates — secure)*
4. Publishing status → Click **Publish App** → confirm.

---

## Part 3 — Google Drive Token (Server-side Institute Account)

The app writes files to the **institute's Google Drive** using a refresh token. This is a one-time setup per environment.

### Step 1 — Add redirect URI for the token script

In GCP → Credentials → your OAuth client, ensure `http://localhost:5555/oauth2callback` is in **Authorised redirect URIs**.

### Step 2 — Set env vars

In `.env.local`:
```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

### Step 3 — Run the consent script

```bash
node --env-file=.env.local scripts/drive-consent.mjs
```

Open the printed URL **in the browser signed in as the institute's Google account** (the one that will own all Drive files). After consent, copy the printed token:

```bash
GOOGLE_REFRESH_TOKEN=your-refresh-token-here
```

Paste into `.env.local` and into **Vercel → Environment Variables** for production.

### Step 4 — Optional: Pre-create the root Drive folder

```bash
GOOGLE_DRIVE_ROOT_FOLDER_ID=        # leave empty — auto-created as "Cert-Ed Academia"
```

Or create a folder manually in Drive, get its ID from the URL:
`https://drive.google.com/drive/folders/**FOLDER_ID_HERE**`, and set it in the env.

---

## Part 4 — Supabase Projects

1. [supabase.com](https://supabase.com) → **New project** (create 2: `cert-ed-prod` and `cert-ed-preview`).
2. For each, go to **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` *(server only, never expose)*
3. **Authentication → Providers → Google** → Enable, paste Client ID + Secret.
4. **Authentication → URL Configuration:**
   - Site URL: `https://app.certedacademia.com`
   - Redirect URLs: `http://localhost:3000/**` and your Vercel preview domain pattern.
5. Apply all migrations (**SQL Editor** or `supabase db push`):
   - Run files `0001` through `0008` from `supabase/migrations/` in order.
6. Seed the first admin:
```bash
node --env-file=.env.local -e "
import('@supabase/supabase-js').then(async ({createClient}) => {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { error } = await c.from('profiles').upsert(
    { email: process.env.SEED_ADMIN_EMAIL, full_name: 'Admin', role: 'admin', status: 'active' },
    { onConflict: 'email' }
  )
  console.log(error ?? 'Admin seeded')
})"
```

---

## Part 5 — Google Meet (Tutor–Student Live Sessions)

Google Meet links do **not** require any API credentials for basic use — tutors create them manually and paste the URL into the academy system. The app already stores `drive_link` fields on resources and calendar events for this purpose.

### Recommended workflow

| Who | Action |
|---|---|
| **Tutor / Admin** | Opens [meet.google.com](https://meet.google.com), clicks **New meeting → Create a meeting for later**, copies the link. |
| **Admin** | Goes to **Calendar** in the portal → creates a calendar event → pastes the Meet link in the **description** or **location** field. |
| **Students** | Open the Calendar page → click the event → see the Meet link in the description → join. |

### Optional: Auto-generate Meet links via Google Calendar API

If you want the admin to auto-generate a Meet link when creating events, this requires enabling the **Google Calendar API** in GCP and using `conferenceData` in event creation. This is a Phase 2 enhancement. The steps are:

1. Enable `Google Calendar API` in GCP.
2. Create a service account with **Calendar Editor** role on the institute calendar.
3. Download the service account JSON key → store contents as `GOOGLE_CALENDAR_SERVICE_KEY` env var.
4. When inserting a calendar event, pass:
   ```js
   conferenceData: { createRequest: { requestId: uuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
   ```
   This returns a `hangoutLink` you can save and display to students.

---

## Part 6 — Environment Variables Checklist

Copy this into your `.env.local` (and mirror to Vercel production + preview):

```bash
# ── Supabase ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # server only

# ── Google ────────────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REFRESH_TOKEN=1//0e...              # institute Drive account token
GOOGLE_DRIVE_ROOT_FOLDER_ID=              # optional — auto-created if blank

# ── App hostnames ─────────────────────────────────────────────────────────────
APP_HOSTNAME=app.certedacademia.com
MARKETING_HOSTNAME=certedacademia.com

# ── Admin seed ────────────────────────────────────────────────────────────────
SEED_ADMIN_EMAIL=admin@yourdomain.com

# ── Security ──────────────────────────────────────────────────────────────────
CRON_SECRET=a-long-random-string          # protects /api/cron/*
```

---

## Summary of What's Been Implemented in Code

| Feature | Status |
|---|---|
| Many-to-many tutor–student relationships (`mentorships` table) | ✅ Done |
| Tutor access to mentee submissions across all courses (RLS) | ✅ Done (migration 0008) |
| Comment threads on submissions (tutor ↔ student) | ✅ Done |
| Reminders panel on dashboard (all roles) | ✅ Done |
| Google Drive resource links (open in Drive instead of download) | ✅ Done |
| Google Meet — manual link paste workflow | ✅ Works via Calendar event description |
| Google Meet — auto-generate via Calendar API | ⏳ Phase 2 optional enhancement |

# Cert-Ed Academia — Learning App (Student/Teacher/Admin) — Design Spec

- **Date:** 2026-06-25
- **Status:** Draft (awaiting user review)
- **Scope:** Authenticated learning application served at `app.certedacademia.com`, added to the existing `wed_cert` repo alongside the public marketing site.

---

## 1. Overview & Goals

Add a private, role-based application to Cert-Ed Academia (a tuition academy serving CBSE/ICSE students across India and the GCC). It gives **admins**, **teachers**, and **students** a single place to manage announcements, learning resources, assignments and submissions, fee receipts and pay slips, and a class timetable/calendar.

It is built to run at **~₹0/month** on free tiers for a **tiny pilot (<50 users)**, while using a **production-grade data layer** so there is no rewrite when it grows.

**Success criteria for v1:**
- A student can log in, see their announcements/assignments/timetable, submit an assignment, and download their fee receipts.
- A teacher can post announcements/resources/assignments, view submissions, and download their pay slips.
- An admin can manage the user allowlist (incl. revoke), courses, enrollments, the timetable, and issue receipts/pay slips as branded PDFs.

---

## 2. Scope

**In scope (v1):**
1. Auth (Google login) + allowlist + role-based access (admin/teacher/student) + admin **revoke**.
2. Announcements.
3. Resources (Drive-stored files).
4. Assignments + submissions (two-way Drive flow).
5. Finance: fee receipts (students) + pay slips (teachers) as branded PDFs.
6. Calendar/timetable (month ⇄ week toggle).
7. Admin: users/allowlist, courses, enrollments, org settings.

**Out of scope (later phases):** transactional email notifications, dark mode, large-video "recordings", grading/marks, attendance, fees ledger/payment-gateway, mock tests, certificates, multi-batch/academic-year modeling.

The existing marketing site (root pages: home, about, blogs, classes, contact) is **untouched** beyond adding hostname routing in `middleware.ts`.

---

## 3. Tech Stack & Rationale

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 14 App Router + TypeScript (existing) | Reuse current repo/skills/Vercel deploy |
| Styling | Tailwind CSS 4 (existing) | Consistency with marketing site |
| Auth | **Supabase Auth** (Google provider) | Free, "Sign in with Google", integrates with RLS |
| Data | **Supabase Postgres** + Row-Level Security | Real relational integrity; RLS is the security boundary |
| Files | **Google Drive** (institute-owned account) | Files live in the academy's own Drive (familiar, 15 GB free) |
| Calendar UI | **FullCalendar** (`@fullcalendar/react`, MIT) | Built-in month (`dayGridMonth`) + week (`timeGridWeek`) views |
| PDF | **HTML → PDF** via headless Chromium (`@sparticuz/chromium` + `puppeteer-core`) | Renders the existing branded HTML templates (Option B) at pixel fidelity, incl. brand fonts + `clip-path`; low volume so cold-start weight is fine. `@react-pdf/renderer` kept as a lighter fallback. |
| Validation | **Zod** | Schema validation at all boundaries |
| Hosting | Vercel (existing) | One project, two domains |

This is the **Hybrid** approach: Supabase for auth + data, Google Drive for files.

---

## 4. Architecture

### 4.0 Backend approach — no standalone server
There is **no separate backend service** (no Express/Nest/Laravel — nothing extra to deploy or pay for). The "backend" is:
- **Next.js server-side code** — Route Handlers (`app/api/*`) + Server Actions + server components, running as **Vercel serverless functions**. This backend-for-frontend holds the secrets and does all trusted work: auth/role checks, the Drive refresh-token + uploads `init`/`finalize`, PDF generation, and admin operations using the Supabase **service-role** key.
- **Supabase** as managed **Backend-as-a-Service**: Postgres + Auth + RLS (authorization) (+ Storage only in the CORS fallback).
- File bytes go to **Google Drive** directly (browser→Google); the server only orchestrates.

Two Supabase clients are used inside server code: the **anon/user client** (RLS-enforced, for user-scoped reads/writes) and the **service-role client** (bypasses RLS, server-only, for admin actions like adding users or revoking access). Scheduled jobs (`cron/reconcile-uploads`, `cron/keepalive`) run via **Vercel Cron** hitting API routes. The only non-deployed helper is a **one-time local Node consent script** that mints the Drive refresh token. Net result: **one TypeScript codebase, one deploy, ₹0.**

### 4.1 Deployment & subdomain routing
One Next.js app, one Vercel project, two domains. App pages live in the route group `app/(app)/`; the existing marketing pages keep their current root location (`app/page.tsx`, `app/about/…`, optionally wrapped in an `(marketing)` group for clarity). Route groups are organizational only — they add no URL segment — so the two page sets never collide on path (the only shared path is `/`, handled below).

A root `middleware.ts` branches on **hostname**:
- `certedacademia.com` → serves the marketing pages (public/SSG); any app path (`/dashboard`, `/admin/*`, …) redirects to the app subdomain.
- `app.certedacademia.com` → enforces a session and serves the `app/(app)/` routes (dynamic); `/` redirects to `/dashboard` (or `/login` when unauthenticated); marketing paths are not exposed here.

Marketing pages stay public; app pages require a valid session + `active` allowlist row.

### 4.2 Auth & the allowlist gate
- Supabase Auth with the **Google provider**.
- Because anyone with a Google account can complete that login, the **real gate is the `profiles` allowlist**: middleware + a server check confirm the signed-in email has an `active` `profiles` row.
  - No row → "Access pending — contact the academy" page; no app access.
  - `status = disabled` → "Access revoked" page.
- The row's `role` (`admin`/`teacher`/`student`) drives all downstream authorization.
- Admins seed the allowlist by email; the **first matching Google login binds** `auth.uid` to the row.
- **First admin bootstrap:** seeded from `SEED_ADMIN_EMAIL` during the initial migration (solves the chicken-and-egg problem).

### 4.3 Google Drive integration
A Google **service account cannot own files** on a non-Workspace account (zero storage quota), so files are owned by **one institute Google account** ("Drive owner"):
- A **one-time consent script** (run locally by the admin) grants Drive scope and yields a long-lived **refresh token**, stored as a server secret.
- The server mints short-lived access tokens from the refresh token (cached in memory) for all Drive calls.
- Folder tree (auto-created, IDs cached in `drive_folders`):
  ```
  Cert-Ed Academia/
    <Course>/
      Resources/
      Assignments/
    Student Submissions/
      <Course>/
    Finance/
      Receipts/
      Pay Slips/
  ```
- **Folder-creation races** are guarded by the `drive_folders` cache + upsert (no duplicate folders).

> ⚠️ **Critical:** the Google OAuth consent screen must be **"In production"**, not "Testing". Apps in "Testing" issue refresh tokens that **expire after 7 days**. Production status → long-lived token.

### 4.4 File uploads — direct-to-Drive resumable (no Vercel limit)
Vercel caps request bodies at ~4.5 MB, so file bytes **never pass through our functions**. Instead, **server-initiated resumable upload**:

1. **`init`** — Browser asks our API to start an upload (filename, size, type, context). Server (holding the Drive token) opens a Drive **resumable session**, writes a **`pending`** record, and returns **only the single-use session URI** to the browser. *(The Drive token never reaches the browser.)*
2. **`upload`** — Browser PUTs the file bytes **directly to the session URI** (Google's servers).
3. **`finalize`** — Browser calls our `finalize` endpoint with the Drive file id. Server **re-reads the file's Drive metadata** (`size`, `mimeType`), validates against allowed types/max size, sets the file private, and flips the record to **active**. No success shown to the user until finalize confirms.

**Controls ("manage carefully"):**
- **Validation at finalize** (client claims can't be trusted since bytes bypass the server).
- **Orphan reconciliation job** — scheduled sweep trashes Drive files + `pending` rows from sessions never finalized beyond N hours.
- **Files stay private** — downloads go through an access-checked endpoint that verifies role/enrollment, then redirects to a short-lived Drive link.
- **Rate-limit** session creation per user.

> ⚠️ **Spike first:** browser PUT to the Drive resumable session URI depends on Google returning permissive **CORS** for that origin. The implementation plan opens with a small spike proving a real cross-origin resumable upload before building on it.
> **Fallback if CORS misbehaves:** direct-upload to **Supabase Storage** (signed uploads, CORS-clean) then a server job copies into Drive — same "no Vercel upload limit" guarantee, more plumbing.

Receipt/pay-slip PDFs are exempt from all of this: they are small, generated server-side, and uploaded server→Drive directly.

### 4.5 PDF generation
The finance documents reuse the **existing branded HTML templates** in `receipt/Receipt Templates.dc.html` — chosen design **Option B · Modern Minimal** — with the **brand fonts** (Louis George Cafe + Dagger Square, in `receipt/assets/fonts/`). A server route renders the chosen template (a React server component or template literal) with the receipt/pay-slip data + `org_settings`, then converts **HTML→PDF via headless Chromium** (`@sparticuz/chromium` + `puppeteer-core`) on Vercel. Receipts and pay slips are **sibling templates** sharing header/footer; all static content comes from `org_settings`, never hardcoded. Volume is low (a handful/day) so Chromium cold-start weight is acceptable; `@react-pdf/renderer` remains a lighter fallback. *(The template's `{{ }}` / `sc-for` / `sc-if` placeholders are from a design tool and get ported to the chosen render path.)*

---

## 5. Data Model (Supabase Postgres + RLS)

> Every table has `id` (uuid), `created_at`. RLS enabled on all tables.

**Identity & structure**
- `profiles` — `id` (= `auth.uid`), `email` (unique), `full_name`, `role` (`admin`|`teacher`|`student`), `status` (`active`|`pending`|`disabled`), `class_level` (student grade, e.g. "5"). **This is the allowlist.**
- `courses` — `name`, `status` (`active`|`archived`).
- `enrollments` — `student_id`→profiles, `course_id`→courses (unique pair). Decides which students see which course's content.
- `course_teachers` — `teacher_id`→profiles, `course_id`→courses (unique pair). Scopes which courses a teacher can view and manage.

**Content**
- `resources` — `course_id`, `title`, `drive_file_id`, `drive_link`, `uploaded_by`, `status` (`active`|`pending`|`archived`).
- `assignments` — `course_id`, `title`, `description`, `due_date`, optional attachment (`attachment_drive_file_id`/`_link`), `created_by`, `status`.
- `submissions` — `assignment_id`, `student_id`, `drive_file_id`, `drive_link`, `status` (`submitted`|`late`, computed vs the absolute `due_date` instant), `submitted_at`. Resubmission allowed until due date; latest active, prior kept as history.
- `announcements` — optional `course_id` (null = global), `title`, `message`, `author_id`, `status`.

**Finance** (immutable once issued)
- `receipts` — `number` (unique, `CEA-R-YYYY-0001`), `student_id`, `student_name_snapshot`, `class_snapshot`, `issue_date`, `currency`, `note`, `subtotal`, `discount` (nullable), `total` (= subtotal − discount), `drive_file_id`/`_link`, `voided` (bool), `created_by`. *(paid/due status + due-date omitted for now.)*
- `receipt_lines` — `receipt_id`, `subject`, `hours`, `rate`, `amount`.
- `payslips` — `number` (`CEA-P-YYYY-0001`), `teacher_id`, `teacher_name_snapshot`, `issue_date`, `currency`, `note`, `total`, `drive_file_id`/`_link`, `voided`, `created_by`.
- `payslip_lines` — `payslip_id`, `label` (subject/class), `hours`, `rate`, `amount`.
- `document_counters` — `(doc_type, year)` → `last_number`; bumped inside the issuing transaction (concurrency-safe; gaps acceptable, duplicates not).

**Calendar / timetable**
- `timetable_slots` — `course_id`, `subject`, `teacher_id`, `day_of_week` (0–6), `start_time`, `end_time`, `mode_or_location`, `active`. The recurring weekly schedule. Times are wall-clock in the institute **anchor timezone** (`org_settings.timezone`); each occurrence is converted to an absolute instant, then displayed in the viewer's device timezone.
- `calendar_events` — `title`, `description`, `event_date`, optional `start_time`/`end_time`, optional `course_id` (null = global), `kind` (`event`|`holiday`|`cancellation`|`reschedule`), optional `slot_id` (for slot overrides), `created_by`.

**Infra / ops**
- `org_settings` — single row: institute name, contact email/phone, **bank details** (A/C, IFSC, branch), **terms text**, **signatory** (name, title, `signature_mode` = `text`|`image`, signature text default `"Digitally signed"`, optional image path), default currency, timezone (`Asia/Kolkata`), document number prefixes.
- `drive_folders` — cache of resolved Drive folder ids per `(course_id, kind)`.
- `audit_log` — `actor_id`, `action`, `entity_type`, `entity_id`, `created_at` — for sensitive actions (revoke/restore, finance issue/void, deletes).

### 5.1 Role-based access (RLS + server guards)

Three roles, with **admin as super-admin** (full override). Teachers are scoped to their **assigned courses** (`course_teachers`); students to their **enrolled courses** (`enrollments`). On "update details": **teachers and admin can edit** — teachers within their assigned-course scope, admin everywhere; **students cannot edit** beyond their own display name and their own submissions.

| Capability | Student | Teacher (assigned courses) | Admin (super) |
|---|---|---|---|
| Sign in; edit own display name | ✓ | ✓ | ✓ |
| View announcements / resources / assignments / timetable | enrolled scope | assigned scope | all |
| Create / **update** / archive announcements, resources, assignments | ✗ | ✓ | ✓ |
| Create / **update** timetable slots & calendar events | ✗ | ✓ | ✓ |
| Submit assignments | own | ✗ | ✗ |
| View submissions | ✗ | for own assignments | all |
| View receipts | own | ✗ | all |
| View pay slips | ✗ | own | all |
| Issue / void receipts & pay slips | ✗ | ✗ | ✓ |
| Manage users / allowlist / roles; revoke / restore | ✗ | ✗ | ✓ |
| Manage courses, enrollments, **teacher↔course assignments** | ✗ | ✗ | ✓ |
| Org settings | ✗ | ✗ | ✓ |

RLS policies key off a Postgres helper reading `role`/`status` from `profiles` where `id = auth.uid()`, plus `enrollments` / `course_teachers` for course-scoped reads and writes. The **service-role key is server-only**, never exposed to the client.

---

## 6. Routes & Pages

**Pages** (`app/(app)/`, gated by middleware + role):

| Route | Student | Teacher | Admin |
|---|---|---|---|
| `/login` | Google sign-in (public within app subdomain) | | |
| `/dashboard` | announcements + upcoming assignments + shortcuts | quick actions | stats |
| `/announcements` | feed | + post | + post |
| `/resources` | browse/download by enrolled course | + upload | all |
| `/assignments` | view + submit + status | + create, view submissions | all |
| `/calendar` | month⇄week, enrolled classes + deadlines | + manage timetable/events | all |
| `/receipts` | own receipts (download) | — | — |
| `/payslips` | — | own pay slips (download) | — |
| `/admin/users` | — | — | allowlist, roles, revoke/restore |
| `/admin/courses` | — | — | courses + enrollments |
| `/admin/finance` | — | — | issue receipts & pay slips |
| `/admin/settings` | — | — | org settings |

**API routes** (`app/api/`):
- `auth/callback` (Supabase)
- `uploads/init`, `uploads/finalize` (resumable handshake; used by resources/assignments/submissions)
- `resources` (GET/POST/PATCH/archive), `assignments` (GET/POST/PATCH/archive), `assignments/[id]/submissions` (GET), `submissions` (POST record)
- `announcements` (GET/POST/PATCH/archive)
- `calendar` (GET), `timetable` (GET/POST/PATCH), `events` (POST/PATCH)
- *(all write/update endpoints enforce teacher assigned-course scope or admin override)*
- `receipts` (GET/POST), `receipts/[id]/pdf` (download), `receipts/[id]/void` (POST)
- `payslips` (GET/POST), `payslips/[id]/pdf`, `payslips/[id]/void`
- `admin/users` (+ `[id]/revoke`, `[id]/restore`), `admin/courses`, `admin/enrollments`, `admin/course-teachers`, `admin/settings`
- `cron/reconcile-uploads`, `cron/keepalive`

**`lib/` organization** (many small files): `lib/supabase/` (SSR clients), `lib/drive/` (token/folders/resumable), `lib/pdf/` (receipt + pay-slip HTML templates + html-to-pdf render helper), `lib/auth/guards.ts` (`requireRole`), `lib/repos/*` (repository per table), `lib/validation/*` (Zod schemas), `lib/money.ts` (currency formatting via `Intl.NumberFormat`), `lib/time.ts` (institute-TZ helpers).

---

## 7. Feature Detail

### 7.1 Auth / onboarding / revoke
- Login via Google; binding on first match; pending page for unknown emails.
- **Admin adds people** (how teachers/students get in): `/admin/users` → *Add user* with email + role; for **students** also set `class_level` + course **enrollments**, for **teachers** set course **assignments**. This writes a `profiles` allowlist row (`status = active`) via the **service-role** client; the person signs in with that Google email and their `auth.uid` binds on first login. One-by-one for the pilot; bulk import is a later nicety.
- **Revoke:** admin sets `status = disabled` → guards block immediately (→ "Access revoked"), **and** the server calls the Supabase **admin sign-out API** (service-role) to kill live sessions. Reversible via **Restore**. Revoke/restore are `audit_log`ged. Disable (not delete) preserves the user's receipts/submissions history.

### 7.2 Announcements
Teacher/admin create (title, message, optional course); students see a feed scoped to enrolled courses + global. Simplest vertical — proves the auth→data→UI loop.

### 7.3 Resources
Teacher uploads a file via the resumable handshake into the course `Resources/` folder; record created. Students browse by enrolled course and download via the access-checked endpoint.

### 7.4 Assignments + submissions
Teacher posts an assignment (optional attachment) with a `due_date`. Student submits a file (resumable handshake → `Student Submissions/<Course>/`); `status` computed `submitted`/`late` vs the absolute `due_date` instant (times displayed in the viewer's device TZ); resubmission allowed until due, latest wins. Teacher views submissions per assignment. (Grading is out of v1.)

### 7.5 Finance — receipts & pay slips
Shared engine; **admin-only** generation. Ad-hoc itemized lines with **last-used-rate prefill** (newest line for that party + subject).

**Generate flow:** admin form (pick party, date, currency, lines `{subject, hours, rate}`, total auto-sums) → `POST` → Zod-validate → allocate sequential `number` in-transaction → render PDF → upload server→Drive `Finance/Receipts|Pay Slips/` → insert record + lines (+ `audit_log`). Student/teacher download their own via `/[id]/pdf` (access-checked, re-streamed from Drive).

**Receipt template** — **Option B · Modern Minimal** (from `receipt/Receipt Templates.dc.html`, brand fonts Louis George Cafe + Dagger Square): `logo_h` header + contact; thin top accent; **STUDENT** name + Class (left) and **Receipt No / Issued** (right); `DESCRIPTION | AMOUNT` rows (each = `Subject (n hours)` → amount); **Subtotal / optional Discount / Total** summary block; footer = Payment Details (bank), **"Digitally signed by &lt;name&gt;, &lt;title&gt;"** (text now; image slot optional later) and Terms. Pay slip is the sibling for teachers (pay lines + net total; no student/class).

**Integrity:** issued documents are **immutable**; corrections via **void + reissue** (`voided` flag keeps the number; a new corrected doc gets a new number). CSV export available to admin.

### 7.6 Calendar / timetable
`/calendar` on FullCalendar with a **month ⇄ week toggle**. Overlays: expanded `timetable_slots` (recurring weekly), `calendar_events` (one-offs/holidays/cancellations/reschedules), and assignment `due_date`s. Students see their enrolled courses + global; teachers manage slots/events for their **assigned** courses, admin for all. Recurring slot times are anchored to the institute timezone, then **all times render in each viewer's device timezone** (auto-detected), with a timezone label to avoid ambiguity.

---

## 8. Cross-Cutting Decisions ("filled-in blanks")

- **Timezone:** store absolute timestamps in **UTC**; **display in each viewer's device timezone** (auto-detected in the browser via `Intl.DateTimeFormat().resolvedOptions().timeZone`), with a TZ label on time displays. Recurring **timetable** slots are wall-clock anchored to the institute timezone (`org_settings.timezone`, default `Asia/Kolkata`) and converted to absolute instants before display. "Late" logic compares absolute instants, so it is independent of the display timezone.
- **Financial immutability:** no edits; void + reissue; concurrency-safe numbering via `document_counters`.
- **Delete semantics:** content soft-deleted (archived, links survive); finance + submissions retained immutably; Drive files trashed only on hard-delete.
- **Notifications:** in-app only for v1; transactional email deferred (Phase 6).
- **Downloads:** files never "anyone with link"; access-checked endpoint → short-lived Drive link.
- **Rate limiting:** lightweight per-user limits on upload-session creation + write endpoints.
- **Search/pagination:** server-side pagination + simple title search; no advanced search.
- **Dark mode:** deferred; v1 ships mobile-first responsive light UI.
- **Preview vs prod:** a separate Supabase project for preview/dev; production keys only on the production deployment.
- **Backups/export:** admin CSV export for finance; document Supabase free-tier backup limits; periodic manual export recommended.
- **Audit log:** sensitive actions (revoke/restore, finance issue/void, deletes) recorded.

---

## 9. Security

- RLS is the primary boundary; every table policy-protected; service-role key server-only.
- Allowlist + role guards in middleware and per route; disabled users blocked + force-signed-out.
- Drive token held server-side only; browsers receive only single-use, folder-scoped session URIs.
- Finalize re-validates uploaded file type/size from Drive metadata (never trust client).
- All inputs validated with Zod at API boundaries.
- No secrets in source; `.env.example` documents required vars.
- OAuth consent screen in **production** status (token longevity).

---

## 10. Testing Strategy (TDD, ~80% target)

- **Unit:** total math, currency formatting, receipt-number allocation, Zod validators, role guards (incl. teacher assigned-course scope), last-used-rate prefill, absolute "late" logic + timezone conversion (anchor↔device), Drive folder resolver (mocked).
- **Integration:** API routes with Supabase + Drive mocked; **RLS policy tests** (seeded per-role users, incl. teacher assigned-course scoping and admin override) — the security boundary.
- **E2E (Playwright):** login per role; student submits assignment + downloads receipt; admin issues a receipt → student sees it; teacher posts announcement; calendar month⇄week toggle.
- External services mocked in unit/integration; optional thin live smoke test for the Drive resumable spike.

---

## 11. Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only

# Google Drive (institute "Drive owner" account)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_ROOT_FOLDER_ID=        # optional; auto-created if absent

# App
SEED_ADMIN_EMAIL=                   # first admin bootstrap
APP_HOSTNAME=app.certedacademia.com
MARKETING_HOSTNAME=certedacademia.com
```
The Google login provider (per-user) and the Drive refresh token (single institute identity) may share one Google Cloud OAuth client but are different flows.

---

## 12. Build Phasing (all in v1 deliverable; this is build order)

- **Phase 0 — Foundation/spine:** Supabase project + Google provider; hostname middleware + `app/(app)/`; `profiles` allowlist + `requireRole`; login + role-aware empty dashboard; Drive consent script → token → folder bootstrap; `org_settings` seed; `SEED_ADMIN_EMAIL`. **Includes the Drive resumable CORS spike.**
- **Phase 1 — Announcements + Admin** (users/allowlist + revoke/restore, courses, enrollments, teacher↔course assignments).
- **Phase 2 — Resources** (resumable upload path: init/finalize/reconcile).
- **Phase 3 — Assignments + submissions.**
- **Phase 4 — Finance** (receipt + pay-slip PDF engine, numbering, void, `org_settings` editor, CSV export).
- **Phase 5 — Calendar & timetable** (FullCalendar, slots + events + deadline overlay).
- **Later:** email notifications, dark mode, recordings/large-video, grading, attendance, certificates, multi-batch.

---

## 13. Risk Register

| Risk | Mitigation |
|---|---|
| ⚠️ Google refresh-token expiry (7-day if app in "Testing") | Set OAuth consent screen to **Production** |
| ⚠️ Drive resumable **CORS** for browser PUT unverified | **Spike first**; fallback = Supabase Storage staging → server copy |
| Two-phase upload orphans (partial/abandoned) | `init→finalize` handshake + reconciliation job |
| Client can't be trusted (bytes bypass server) | Re-validate type/size from Drive metadata at finalize |
| Supabase free tier pauses after ~7 days idle | `cron/keepalive` ping; monitor 500 MB DB / 1 GB caps |
| RLS misconfiguration = data leak | RLS policy tests; service-role key server-only |
| Subdomain auth cookies | Verify Supabase session cookie scope + middleware refresh on `app.` subdomain |
| Preview deploy writing to prod data | Separate Supabase project for preview |
| PDF decorative footer fidelity vs template | Approximate with positioned blocks; acceptable |

---

## 14. Open Items / To Confirm at Review
- Confirm institute "Drive owner" Google account exists (or will be created) for the refresh-token consent.
- Confirm the architecture defaults in §8 (timezone, immutability, soft-delete, notifications, dark-mode deferral, etc.).
- Provide a signature image later if "Digitally signed" text is not sufficient.
- Confirm the resumable-CORS fallback (Supabase Storage staging) is acceptable if the spike fails.

# Cert-Ed Academia

Two apps share this repo, split by host:

1. **Marketing site** (`certedacademia.com`) — the public site: home, classes, blog, contact.
2. **Learning portal** (`app.certedacademia.com`) — a private, class-centric portal for the academy's **admins, tutors, mentors and students**, modelled on Google Classroom.

## The portal at a glance

- **Allowlist-only** access — Google sign-in via Supabase; admins pre-create profiles by email, bound to the Google identity on first login. No self-registration.
- **Class-centric** — Stream / Classwork / People live inside each class.
- **Roles**: admin, tutor, student — plus a pastoral **mentor** (a tutor given oversight of specific students).
- **Files are Google Drive links** by default — users paste an "anyone with the link" URL. An **optional** one-click Drive Picker can upload to the student's own Drive (see the setup guide).
- **Features**: classes (admin-owned lifecycle), assignments + Drive-link submissions (on-time/late), resources, announcements & meet links (per-class **and** academy-wide), finance (receipts / pay slips, on-demand PDF), calendar + recurring timetable, per-role dashboards, mentorships, reminders.

## Tech stack

- **Next.js 14** (App Router) · **TypeScript** (strict)
- **Supabase** — Auth (Google) + **Postgres with row-level security** (the trust boundary)
- **Tailwind CSS v4**
- Vercel (hosting) · Google Apps Script (marketing contact form)

## Local development (mock mode — no external services)

The portal runs against a JSON-file fake of Supabase, so nothing external is required:

```bash
cp .env.example .env.local   # already configured for mock mode
npm install
npm run dev
```

Open the app host and sign in at `/login` with a demo account — `admin@mock.test`, `tutor@mock.test`, `mentor@mock.test`, or `student@mock.test` (password `cert-ed`). Delete `.mock-db.json` to reseed.

## Going live

See **[docs/setup-guide.md](docs/setup-guide.md)** — create a Supabase project, apply migrations `0001`–`0006`, configure Google sign-in **inside Supabase**, and seed the first admin.

## Testing

```bash
npm test                 # unit + integration (vitest)
npx tsc --noEmit         # type-check
npx playwright test      # full-browser E2E: persona journeys + a responsive overflow sweep
```

## Layout

| Path | What's there |
|---|---|
| `src/app/(mkt)` | Marketing site |
| `src/app/(prt)` | The portal (class-centric; styles scoped under `.prt-scope`) |
| `src/lib/repos` | Data access (one repo per table) |
| `src/lib/auth`, `src/lib/finance`, `src/lib/mock` | Auth/scoping, finance + PDF, mock harness |
| `supabase/migrations` | Schema — 6 consolidated files with RLS |

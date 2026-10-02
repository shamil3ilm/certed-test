# Handover — the state of the world

**Last reviewed: 2026-09-29.**

The repository's CI is green and its tests pass, which says the code is consistent with itself. It does not say the running system is finished. This file is the register of what is still open, so someone arriving at a clean clone does not have to infer it.

Keep it current: close an item by deleting its row and, where the fact is durable, writing it into the doc that owns it (`deployment.md`, `operations.md`, `environment.md`). A stale register is worse than none.

## How to read this

Each item says what is wrong or missing, what "done" looks like, and where the detail lives. Nothing here contains a secret — see [accounts-and-access.md](accounts-and-access.md) for who holds what.

---

## Blocking — the live system is degraded until these close

### 1. Production database is behind the migration chain

The chain head is `0122_assignments_fall_due.sql`. Production was last taken to `0118` plus the out-of-band server-function grants. Migrations **0119, 0120, 0121 and 0122** have not been applied there.

**Done looks like:** production at the chain head, and the verification query for each returning all `true`. Staging also needs 0121 and 0122, and a re-run of the 0119/0120 script so the two mentorship function bodies match the chain byte for byte.

---

## Not blocking, but unfinished

### 2. Custodial Drive storage — configured, not yet proven

All four `GOOGLE_DRIVE_*` variables were set on 2026-09-30, the app has been redeployed since, and the OAuth consent screen was already **In production** when the refresh token was captured — so the token is long-lived and there is no 7-day expiry waiting.

**One thing remains: nobody has uploaded a file yet.** Until someone has, "configured" and "working" are different claims, and the ways this fails are quiet ones — a wrong folder id, or a token captured while signed in as the wrong Google account, both of which produce a setup that looks healthy while filing student records somewhere nobody intends.

**Done looks like**, in order:

1. Sign in, attach a PDF to a submission or a resource, and confirm the upload completes.
2. Open the academy's Drive folder **as the dedicated academy account** and see the file there, under a date subfolder.
3. Download it back through the app, to prove the streaming read path works and not just the write.
4. Confirm nothing is stuck: no rows sitting in `pending` or `failed`.

```sql
select status, count(*), max(created_at) as latest
from attachments group by status order by status;
```

Expect `active` rows and nothing accumulating in `pending` or `failed`. A stuck `pending` means the two-phase upload never completed; `failed` carries the reason. The `reconcile-attachments` cron sweeps both, and `queue-health` alarms once failures pile up.

### 3. Backups are not configured, and no restore has been tested

[operations.md](operations.md) describes the intent. Neither the scheduled backup nor a restore rehearsal has been done.

**Done looks like:** a daily backup running, and one restore performed end to end into a scratch project, with the date recorded here.

### 4. Guardian consent is hidden behind a flag

`SHOW_GUARDIAN_CONSENT` in `src/app/(prt)/register/RegisterForm.tsx` is `false`, hiding the consent tick while the policy pages were being settled. **The server rule is untouched**, so an account whose date of birth makes it a minor still cannot complete registration without guardian consent — and while the box is hidden, that consent cannot be given. Minors therefore cannot currently register.

Set the flag back to `true` once the policy wording is final. A store submission covering minors forces this decision anyway.

### 5. Policy pages carry unfilled details

The legal entity name and the retention periods are still to be confirmed by the owners. The pages are live and honest about what they say; these are gaps to fill, not drafts to replace.

### 6. Smaller open threads

- **Leaked-password protection** is off in Supabase auth settings; it was deliberately deferred.
- **Publishing status of the Google OAuth consent screen** is settled — it is In production, which is what makes the Drive refresh token long-lived.
- **`GOOGLE_SCRIPT_URL`** (the contact-form Apps Script endpoint) is unset.
- **Deploys are owner-triggered.** Pushing to `main` does not release; the owner redeploys.
- **Supabase JWT expiry is still the one-hour default.** Drop it to 15–30 minutes before the mobile apps ship: access tokens on phones live in more places than cookies on a laptop, and the client refreshes silently.

---

## Recently closed

- **Google sign-in** — working as of **2026-09-30**. It had been failing at Supabase's token exchange with Google (`Unable to exchange external code`, `invalid_grant`). Diagnosis on 2026-09-29 verified the client id, the registered redirect URI and the client id/secret pair directly, which left the secret stored in Supabase or a spent authorization code as the remaining candidates. _What finally fixed it is not recorded — worth one line here, because the next person debugging OAuth will come looking._

## Mobile apps

Decided on 2026-09-29 and recorded in [adr/0007](adr/0007-mobile-apps-expo-and-api-v1.md): Expo / React Native for students and tutors, over a versioned `/api/v1` that reuses the existing guards. The preparatory work in this repository has landed. The API layer and the app have not started, and store accounts do not exist yet — the Apple organisation enrolment needs a D-U-N-S number and is the long pole.

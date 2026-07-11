# Drive Picker submissions — design

**Date:** 2026-07-10
**Status:** Proposed (awaiting review)
**Feature:** Let students attach homework via the Google Drive Picker instead of manually pasting a share link.

---

## 1. Problem & goal

Today a student submits work by uploading a file to their *own* Google Drive (in Google's UI), setting "Anyone with the link" sharing by hand, copying the share URL, and pasting it into `SubmitForm`. Three things go wrong often: they forget the sharing setting (tutor gets "access denied"), paste the wrong kind of link, or don't date/organise the file.

**Goal:** replace the manual paste with a one-click **"Attach from Drive"** button that opens the Google **Picker**, lets the student upload a new file or pick an existing one from their own Drive, **sets sharing automatically**, and records the submission — while keeping our own assignment model, roles, and on-time/late tracking.

This is the mechanism Google Classroom uses under the hood (the Picker + Drive), embedded in our own portal.

### Why this approach (recap of the decision)
- **Storage stays in each student's own 15 GB Drive** — distributed, ₹0, no central bucket, no academy-owned storage account, no Cloudflare R2.
- **Upload is browser → Google directly** — Vercel's ~4.5 MB request-body limit never applies.
- **No refresh token to keep alive** — tokens are the *student's own*, short-lived, obtained client-side on demand via Google Identity Services. This is the key difference from the retired central-Drive-account integration.
- It is an **incremental upgrade of the existing link-based model**, not a rebuild: the manual paste path is kept as a fallback.

## 2. Non-goals

- **Not** re-adding a central academy Drive account or a server-side upload engine.
- **Not** replacing our assignment/grading model with Google Classroom, and **not** using the Classroom API.
- **Not** central/streamed serving — the teacher opens the student's Drive link (as today). Guaranteed-available central copies remain out of scope (would need central storage).
- **Not** per-recipient private sharing in v1 (see §7 — MVP uses "anyone with the link", matching today's posture; per-teacher sharing is a documented future enhancement).
- **No** change to resources or meet links; submissions only.

## 3. Current state (what we're extending)

- `src/app/(prt)/assignments/SubmitForm.tsx` — client component; `url` state; soft `checkDriveLink` nudge; submits via `submitLinkAction`.
- `src/app/(prt)/assignments/submit-action.ts` — server action, Zod `{ assignment_id: uuid, url: url }`, `requireRole(['student'])`, `recordSubmission`.
- `src/lib/repos/submissions.ts` — `Submission` type (`drive_link: string | null`), `recordSubmission({ assignment_id, student_id, drive_link, due_date })`; supersedes the prior active row and computes on-time/late.
- Mock mode (`NEXT_PUBLIC_MOCK_MODE`) runs offline against `.mock-db.json`; Playwright drives the paste path.

## 4. Architecture

Two layers, kept apart so the untestable browser/Google glue is thin and the logic is pure and tested.

```
Student (in portal, logged in via Google)
        │  clicks "Attach from Drive"
        ▼
Google Identity Services  ──►  short-lived access token (scope: drive.file)
        │
        ▼
Google Picker  ──►  upload new file OR pick existing (student's own Drive)
        │  returns { id, url, name, mimeType, sizeBytes }
        ▼
driveShare.shareAnyoneWithLink(fileId, token)   (Drive REST permissions.create)
        │
        ▼
submitLinkAction({ assignment_id, url, file_name })   (existing server action, extended)
        │
        ▼
submissions row  (drive_link = webViewLink, file_name, submitted_at, on-time/late)
```

### Modules (new, under `src/lib/google/`)
| Module | Responsibility | Tested? |
|---|---|---|
| `driveConfig.ts` | Read `NEXT_PUBLIC_GOOGLE_*` env; `isPickerConfigured()` (false in mock / when unset) | ✅ unit |
| `pickerResult.ts` | `parsePickerDoc(raw)` → normalized `PickedFile` or `null` | ✅ unit |
| `driveShare.ts` | Build + send the `permissions.create` request; `buildShareRequest()` pure | ✅ unit (builder) |
| `picker.ts` | Client-only: lazy-load GIS + gapi picker, `getDriveAccessToken()`, `showDrivePicker()` | ✖ manual |

### Config / env (all client-side, public by design — restricted by HTTP-referrer + API restrictions in Google Cloud)
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — OAuth 2.0 Web client ID
- `NEXT_PUBLIC_GOOGLE_API_KEY` — API key (Picker API)
- `NEXT_PUBLIC_GOOGLE_APP_ID` — GCP project number

When any are absent (local/mock, or not yet set up), `isPickerConfigured()` returns `false` and the form shows the **paste-a-link fallback** — so local dev and Playwright keep working offline with no Google dependency.

## 5. Token & consent flow

- A **separate** GIS token client (`google.accounts.oauth2.initTokenClient`) requests scope `https://www.googleapis.com/auth/drive.file` — access to *only files the app creates or the user opens with it*. It does **not** touch Supabase's login token (auth and Drive scope stay decoupled).
- We pass `login_hint = <student's email from profile>` so Google pre-selects the right account.
- The student consents once; tokens are ~1 h, held in memory only, re-requested on demand. **Nothing is stored server-side; there is no refresh token.**

## 6. Data model

Reuse `submissions.drive_link` for the Picker's `webViewLink` (the existing open/display path is unchanged). Add one nullable column so the teacher's list can show a filename instead of a raw URL.

```sql
-- supabase/migrations/0007_submission_file_name.sql
alter table submissions add column if not exists file_name text;
```

`Submission` type and `recordSubmission` input gain `file_name?: string | null`. No `file_id` column (YAGNI — the id is embedded in the URL). The paste fallback simply leaves `file_name` null.

## 7. Security & privacy

- **Scope minimisation:** `drive.file` only — the app can never enumerate a student's Drive, only handle files they explicitly pick/upload with it.
- **Sharing (v1):** after upload the student's token calls `permissions.create` with `{ type: 'anyone', role: 'reader' }` — same "unguessable link" posture as today, but set *automatically* (fixing the #1 failure). The app gates *who sees the link* (RLS on submissions).
- **Future enhancement (documented, not built):** replace "anyone with link" with per-grader `{ type: 'user', role: 'reader', emailAddress }` reads, using the class's tutor emails, for true private sharing.
- **Access control unchanged:** who can view a submission row is still enforced by Supabase RLS + our scope checks.
- Public client IDs/keys are safe when locked to our origin + the Picker/Drive APIs in Google Cloud.

## 8. Mock mode & testing strategy

- **Mock/local:** `isPickerConfigured()` is `false` → paste fallback only. No Google scripts load. Playwright E2E continues to exercise the paste path unchanged.
- **Unit tests (vitest):** `parsePickerDoc` (valid/garbage/missing fields), `isPickerConfigured` (set/unset/mock), `buildShareRequest` (correct method/URL/body). The existing `checkDriveLink` still guards the paste fallback.
- **The Picker/token glue (`picker.ts`) is not unit-tested** — it's thin DOM/Google wiring; verified via the manual checklist (§ plan Task 9) in a real Google-configured environment.
- **No automated E2E for the Picker** — Google's cross-origin iframe can't be driven reliably in Playwright; called out explicitly so coverage isn't overstated.

## 9. Failure modes

| Failure | Handling |
|---|---|
| Google scripts fail to load | Button shows an inline error; paste fallback remains available |
| Student cancels the Picker | No-op; nothing recorded |
| Token/consent denied | Inline "couldn't connect to Google Drive — you can paste a link instead" |
| `permissions.create` fails | Still record the submission, but warn "we couldn't set sharing automatically — set it to 'Anyone with the link' yourself" (reuses existing hint) |
| File later deleted/moved/un-shared by student | Link breaks (same as today's model) — inherent to distributed storage |

## 10. Rollout

1. Ship behind config: with `NEXT_PUBLIC_GOOGLE_*` unset, nothing changes (paste only).
2. Do the Google Cloud setup (docs), set the three env vars in Vercel, and the button appears.
3. Submissions only in v1; resources/meets untouched. Per-grader sharing and (optionally) resources are follow-ups.

## 11. Decisions (settled 2026-07-10)

**Phasing:** use the **Drive Picker for the initial phase (this academic year / semester).** The academy accepts that, in this phase, submissions live in each student's *own* Drive with **no central archive**. Revisit before next year — or sooner if a file-loss incident occurs — to decide whether to move to central storage (academy Drive API or Cloudflare R2) for retention.

Sub-decisions:
1. **Sharing v1** → "anyone with the link" (auto-set).
2. **Paste path** → always available behind a small "or paste a link" affordance (covers Google Docs/YouTube and Google outages).
3. **Scope** → submissions only; resources stay paste-based for now.

**Mitigation for the no-central-copy risk this phase:** the submit UI tells students to keep the file in their Drive until the term ends (the academy *links* to it, it doesn't store a copy).

**Keeping the migration door open (already true in this design):** the storage mechanism is isolated in `src/lib/google/*`, and recording stays behind `submitLinkAction` / `recordSubmission`. Switching *new* submissions to central storage later needs only a new attach path — no change to the submissions model or existing rows. (Optional, not built now: a nullable `submissions.source` marker — `'picker' | 'link' | 'central'` — would let a future migration cleanly tell student-owned submissions apart from central ones.)

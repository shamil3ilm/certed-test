# 0006 — Custodial attachment storage in an academy-owned Google Drive

- **Date:** 2026-08-11
- **Status:** Accepted — implemented. The schema landed as migration `0057_attachments_custodial_storage.sql`; the upload/read/reconcile code lives in `src/lib/services/attachments/*` and `src/lib/data/attachments.ts`; the public-sharing `drive-share.ts` described below has been removed (closes S1/S2).
- **Supersedes:** [0004 — Documents are Google Drive links, not stored files](./0004-google-drive-storage-model.md)

## Context

ADR-0004 chose to store a _link_ rather than a _file_: a document is a Drive URL plus metadata, the host is allowlisted, and no bytes are stored. That decision was sound for its premise — a free-tier budget, staff already keeping material in Drive, and no requirement to hold custody.

Two things have changed.

**The academy now requires persistent custody of attachments.** Under 0004 the files live in each individual user's Drive, uploaded through a client-side Picker with the `drive.file` scope. The academy owns nothing. A student who deletes a file, unshares it, or loses access to their account takes the submission evidence with them, and there is no backup and no recovery path. For assessed work this is a records-retention failure, not merely an inconvenience.

**The sharing model is a disclosure risk.** To make a picked file readable by staff, `drive-share.ts` grants `{role: 'reader', type: 'anyone'}` — "anyone with the link". Every submission and shared document is therefore readable by anyone who obtains the URL, with no authentication, no expiry and no revocation. Drive URLs leak through browser history, referrer headers, forwarded messages and screenshots. ADR-0004 anticipated the _shape_ of this gap ("the app cannot enforce Drive-side sharing settings") but not that the application would itself grant public access.

The 2026-08-11 production readiness audit records these as findings **S1 (critical)** and **S2 (high)**.

## Decision

Attachments become **first-class records with an explicit lifecycle**, and their bytes live in Drive storage the academy controls.

1. **A new `attachments` table** holds the metadata and lifecycle: owner (exactly one of submission / resource / announcement, as separate FK columns so referential integrity is real), uploader, original filename, MIME type, size, Drive file and folder ids, and a `status` of `pending | active | failed | deleted`. **No file bytes in Postgres** — that is what keeps the database inside its size budget.

2. **The server owns the files, not the user.** Uploads go through an authenticated server route using a service account writing into an academy-owned **Google Shared Drive** (or, where Google Workspace is unavailable, a dedicated account whose refresh token is held as a server secret). Google credentials never reach the browser.

3. **No file is ever shared publicly.** The `anyone`-with-link grant is removed outright. Because the service account is the only principal with access, downloads are **streamed through the application** behind the existing permission checks, rather than redirecting to Drive. Preview uses inline streaming rather than Drive's embed viewer, which would require granting the viewer Drive access.

4. **Upload is an explicit two-phase commit**, because it spans two systems and cannot be one transaction: insert `pending` → upload to Drive → update `active`, with `failed` on error. Each Drive file is stamped with `appProperties = {attachmentId, env}`, which is what makes orphan reconciliation possible in both directions — from a stuck row to its file, and from a stray file to the absence of a row. A scheduled job sweeps both.

5. **Folders are partitioned by environment and date**, not by classification: `{env}/{owner_type}/{yyyy}/{mm}/`. Category, subject and visibility are mutable metadata; if they lived in the folder path, every edit would become a Drive file move and a second failure mode. **The database remains the single source of truth for classification.**

## Consequences

- The academy holds every attachment permanently, independent of any individual's account.
- Student work is no longer publicly readable. Access is decided server-side on every request.
- Egress now passes through the application. At ~100 users this is a few GB a month — well inside the hosting allowance — but it is a real cost that redirecting did not have.
- Uploads gain a failure mode that link-pasting did not have (a Drive API error), so the UI must surface `failed` and offer a retry, and the reconciliation job becomes operationally necessary rather than optional.
- Storage consumes the academy's Drive quota rather than each user's.
- **Existing links cannot be migrated automatically.** Those files live in users' personal Drives and the application has never held credentials that can read them. The legacy `drive_link` columns stay readable and marked as external; staff re-upload the material worth keeping; the columns are dropped only after a cutover date.

## Follow-up work

- Choose the credential model — service account + Shared Drive requires Google Workspace; the dedicated-account fallback does not. This is the one open decision.
- Virus scanning is deliberately deferred. At ~100 known, authenticated, allowlisted users of a closed portal the threat model does not yet justify an external scanning service. Revisit if uploads are ever opened to unauthenticated users.
- `checksum_sha256` is present but unused at launch; it enables duplicate detection later.

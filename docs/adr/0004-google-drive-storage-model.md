# 0004 — Documents are Google Drive links, not stored files

- **Date:** 2026-08-03
- **Status:** Accepted

## Context

The academy runs on a free-tier hosting budget. Storing and serving files (question
papers, practice sheets, resources) from object storage adds cost, egress, and a virus/PII
handling surface. Staff already keep material in Google Drive.

## Decision

A document is a Google Drive/Docs link plus metadata (category, subject, visibility,
download count, version history) in the `resources` table — no file bytes are stored. The
link host is allowlisted to `drive.google.com` / `docs.google.com` at write time and
re-checked at redirect time, so the download route cannot become an open redirect. Preview
uses Drive's embed viewer; downloads go through an access-checked redirect that records a
count and an audit entry.

## Consequences

- Zero storage/egress cost; sharing/permissions stay in Drive.
- The app cannot enforce Drive-side sharing settings — a soft nudge (`checkDriveLink`)
  warns on folder/non-Drive links; the hard allowlist blocks non-Drive hosts.
- "Versioning" means snapshotting the prior link + metadata, not the file contents.

## Follow-up work

- If regulatory requirements ever demand custody of the bytes, revisit with Supabase
  Storage and a signed-URL model.

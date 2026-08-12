-- 0057_attachments_custodial_storage.sql
--
-- Custodial attachment storage. Supersedes the link-only model of ADR-0004.
--
-- Until now an "attachment" was a URL string in three different places -
-- submissions.drive_link, resources.drive_link, and the announcements.attachments
-- jsonb array - each pointing at a file living in an END USER'S personal Google
-- Drive, shared "anyone with the link". Two consequences the academy cannot
-- accept: it has custody of nothing (a student who deletes a file, unshares it,
-- or loses their account takes the evidence with them), and every submission is
-- readable by anyone who obtains the URL.
--
-- This table is the metadata side of the replacement. The BYTES live in a Google
-- Drive the academy owns (a dedicated account), reachable only by the server via
-- a refresh token held as a server secret; the browser never sees a Google
-- credential. Postgres stores only the pointer and the lifecycle. No file
-- contents are ever stored here - that is what keeps the Supabase database inside
-- its size budget (~145 MB projected at year one for 100 users).
--
-- Ownership is modelled as three mutually-exclusive nullable FKs rather than a
-- polymorphic (owner_type, owner_id) pair, deliberately: a polymorphic pair
-- cannot carry a foreign key, so nothing would stop an attachment outliving the
-- submission it belongs to. The check constraint enforces exactly-one.
--
-- Lifecycle is explicit because the upload is a two-phase commit across two
-- systems (Postgres, then Drive) and cannot be a single transaction:
--
--     INSERT status='pending'  ->  upload to Drive  ->  UPDATE status='active'
--                                        |
--                                        +--(error)-->  UPDATE status='failed'
--
-- A reconciliation job sweeps rows left 'pending' beyond an hour and any Drive
-- file whose appProperties.attachmentId matches no active row. Stamping that
-- appProperty at upload time is what makes orphan cleanup possible in BOTH
-- directions; without it, matching stray files back to rows is guesswork.
--
-- Writes go through the upload service under the service role (already gated by
-- capability + per-resource permission), matching the class_sessions /
-- resource_versions convention - so no INSERT/UPDATE policy is needed here, only
-- a read policy that mirrors each owner's own visibility rule.

begin;

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),

  -- Exactly one owner; see attachments_one_owner below.
  submission_id   uuid references submissions(id)   on delete cascade,
  resource_id     uuid references resources(id)     on delete cascade,
  announcement_id uuid references announcements(id) on delete cascade,

  -- Who uploaded it. RESTRICT, not SET NULL: an attachment without a known
  -- uploader is an audit gap, so removing such a profile must be a deliberate
  -- act that deals with the attachments first.
  uploaded_by uuid not null references profiles(id) on delete restrict,

  -- As supplied by the user. Sanitized before it reaches Drive, but stored
  -- verbatim so downloads can restore the name the user recognises.
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null,

  -- Optional content hash, for duplicate detection. Nullable: it is a later
  -- hardening step, not a launch requirement.
  checksum_sha256 text,

  storage_provider text not null default 'google_drive',
  -- Drive's file id. UNIQUE so a retry can never register the same Drive file
  -- against two rows. Null while pending.
  drive_file_id text unique,
  drive_folder_id text,

  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete: the row survives removal so the audit trail stays intact after
  -- the Drive file is gone.
  deleted_at timestamptz,

  constraint attachments_one_owner check (
    (submission_id   is not null)::int
  + (resource_id     is not null)::int
  + (announcement_id is not null)::int = 1
  ),

  constraint attachments_status_check
    check (status in ('pending', 'active', 'failed', 'deleted')),

  -- 25 MB. Enforced here as well as in the application so a direct service-role
  -- write cannot bypass the cap and quietly grow Drive usage.
  constraint attachments_size_check
    check (file_size > 0 and file_size <= 26214400),

  constraint attachments_provider_check
    check (storage_provider in ('google_drive')),

  -- An attachment cannot be servable without knowing where its bytes are.
  constraint attachments_active_has_file
    check (status <> 'active' or drive_file_id is not null)
);

-- Owner lookups: "the live attachments for this submission / document /
-- announcement", which is how every render reads this table. Partial on the
-- live states so the indexes stay small as failed and deleted rows accumulate.
create index if not exists attachments_submission_idx
  on attachments (submission_id, created_at desc)
  where submission_id is not null and status = 'active';

create index if not exists attachments_resource_idx
  on attachments (resource_id, created_at desc)
  where resource_id is not null and status = 'active';

create index if not exists attachments_announcement_idx
  on attachments (announcement_id, created_at desc)
  where announcement_id is not null and status = 'active';

-- The reconciliation sweep: rows stuck mid-upload, oldest first. Partial, so it
-- indexes only the handful of rows the job actually cares about.
create index if not exists attachments_reconcile_idx
  on attachments (created_at)
  where status in ('pending', 'failed');

alter table attachments enable row level security;

-- An attachment is visible to exactly whoever may read its owner today. Each
-- branch mirrors the existing read policy for that owner rather than inventing a
-- new rule, so attachment visibility can never drift from the thing it hangs off.
drop policy if exists attachments_read on attachments;
create policy attachments_read on attachments for select using (
  status = 'active'
  and (
    -- Submissions: mirrors submissions_read exactly - admin, anyone teaching the
    -- class, the student themselves (while active), and the student's mentor.
    exists (
      select 1 from submissions s
      where s.id = attachments.submission_id
        and (
          is_active_admin()
          or exists (
            select 1 from assignments a
            where a.id = s.assignment_id and teaches_class(a.class_id)
          )
          or is_self_active(s.student_id)
          or mentors_student(s.student_id)
        )
    )
    -- Documents: mirrors resources_read from 0045.
    or exists (
      select 1 from resources r
      where r.id = attachments.resource_id
        and (
          is_active_admin()
          or teaches_class(r.class_id)
          or (is_enrolled(r.class_id) and r.status = 'active' and r.visibility = 'class')
        )
    )
    -- Announcements: mirrors announcements_read exactly, including the
    -- publish_at / expires_at window - an attachment must not become readable
    -- before its announcement publishes, nor stay readable after it expires.
    or exists (
      select 1 from announcements an
      where an.id = attachments.announcement_id
        and (
          is_active_admin()
          or teaches_class(an.class_id)
          or (
            an.status = 'active'
            and (an.publish_at is null or an.publish_at <= now())
            and (an.expires_at is null or an.expires_at > now())
            and (
              (an.class_id is null and current_status() = 'active'::user_status)
              or is_enrolled(an.class_id)
            )
          )
        )
    )
  )
);

-- Keep updated_at honest without the service having to remember (0031 set the
-- same precedent for capability_overrides).
drop trigger if exists trg_attachments_updated_at on attachments;
create trigger trg_attachments_updated_at
  before update on attachments
  for each row execute function set_updated_at();

commit;


-- ─────────────────────────────────────────────────────────────────────────────
-- NOT INCLUDED, deliberately - do these only once the new path is live and the
-- external links have been dealt with. The existing drive_link values point at
-- files in users' personal Drives that the application has never had credentials
-- to read, so THERE IS NO AUTOMATIC BACKFILL. Staff must re-upload the material
-- worth keeping; everything else ages out.
--
--   alter table submissions   drop column drive_link;
--   alter table submissions   drop column file_name;
--   alter table resources     drop column drive_link;
--   alter table announcements drop column attachments;
--
-- Sequence: ship this migration -> route new uploads through it -> mark the
-- external links in the UI as "stored outside the academy" -> offer a re-upload
-- action -> set a cutover date -> only then drop the columns above in a later
-- migration.
-- ─────────────────────────────────────────────────────────────────────────────

-- 0046_announcement_attachments.sql
--
-- Announcement improvements: attachments (Google Drive PDF/image
-- links + external links, stored as a small jsonb array of {url,label}), an
-- optional scheduled publish time, and an optional expiry. Fully
-- backward-compatible - existing rows get an empty attachments array and null
-- dates (always-published, never-expiring).

begin;

alter table announcements
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists publish_at timestamptz,
  add column if not exists expires_at timestamptz;

-- Read policy: a STUDENT sees a post only once it is published and before it
-- expires; staff (admin, or a tutor/mentor of the class via teaches_class) still
-- see everything, so they can schedule ahead and review expired posts. This
-- rewrites the 0003 policy, folding the two student clauses (enrolled + global)
-- under the same publish/expiry gate.
drop policy if exists announcements_read on announcements;
create policy announcements_read on announcements for select using (
  is_active_admin()
  or teaches_class(class_id)
  or (
    status = 'active'
    and (publish_at is null or publish_at <= now())
    and (expires_at is null or expires_at > now())
    and (
      (class_id is null and current_status() = 'active')
      or is_enrolled(class_id)
    )
  )
);

commit;

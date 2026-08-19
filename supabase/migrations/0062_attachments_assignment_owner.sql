-- 0062_attachments_assignment_owner.sql
-- Adds `assignment` as a fourth attachment owner so an assignment can carry a
-- custodial PDF (reusing the 0057 attachment mechanism). Backward compatible:
-- existing rows keep their single owner and still satisfy the widened check.

begin;

alter table attachments
  add column if not exists assignment_id uuid references assignments(id) on delete cascade;

-- Exactly one owner, now across four columns.
alter table attachments drop constraint if exists attachments_one_owner;
alter table attachments add constraint attachments_one_owner check (
    (submission_id   is not null)::int
  + (resource_id     is not null)::int
  + (announcement_id is not null)::int
  + (assignment_id   is not null)::int = 1
);

create index if not exists attachments_assignment_idx
  on attachments (assignment_id) where assignment_id is not null;

-- Read policy: re-created with a fourth branch mirroring assignments_read (0003) -
-- an assignment's attachment is visible to whoever may read the assignment itself.
-- The three existing branches are reproduced verbatim.
drop policy if exists attachments_read on attachments;
create policy attachments_read on attachments for select using (
  status = 'active'
  and (
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
    or exists (
      select 1 from resources r
      where r.id = attachments.resource_id
        and (
          is_active_admin()
          or teaches_class(r.class_id)
          or (is_enrolled(r.class_id) and r.status = 'active' and r.visibility = 'class')
        )
    )
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
    or exists (
      select 1 from assignments a
      where a.id = attachments.assignment_id
        and (
          is_active_admin()
          or (is_enrolled(a.class_id) and a.status = 'active')
          or teaches_class(a.class_id)
        )
    )
  )
);

commit;

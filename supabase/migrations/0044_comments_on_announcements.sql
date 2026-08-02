-- 0044_comments_on_announcements.sql
-- Announcements become the 4th comment entity type, so a class-stream post carries
-- its own discussion thread just like meet links, resources, and submissions. This
-- is purely additive: widen the entity_type CHECK and extend the comments_read /
-- comments_insert policies with an `announcement` clause that mirrors the existing
-- announcements_read visibility (class-scoped active posts to members + teachers,
-- academy-wide active posts to any active participant, everything to admins). No
-- data backfill and no table changes - meet links and announcements stay separate
-- rows; only their comment surface is unified.

alter table comments drop constraint if exists comments_entity_type_check;
alter table comments
  add constraint comments_entity_type_check
  check (entity_type in ('submission', 'resource', 'meet', 'announcement'));

drop policy if exists comments_read on comments;
create policy comments_read on comments for select using (
  is_active_admin()
  or (
    entity_type = 'submission'
    and exists (
      select 1 from submissions s
      where s.id = entity_id
      and (
        s.student_id = (select p.id from profiles p where p.auth_user_id = auth.uid())
        or exists (select 1 from assignments a where a.id = s.assignment_id and teaches_class(a.class_id))
        or mentors_student(s.student_id)
      )
    )
  )
  or (
    entity_type = 'resource'
    and exists (
      select 1 from resources r
      where r.id = entity_id
      and (teaches_class(r.class_id) or (is_enrolled(r.class_id) and r.status = 'active'))
    )
  )
  or (
    entity_type = 'meet'
    and exists (
      select 1 from meet_links m
      where m.id = entity_id
      and (m.class_id is null or teaches_class(m.class_id) or is_enrolled(m.class_id))
    )
  )
  or (
    entity_type = 'announcement'
    and exists (
      select 1 from announcements an
      where an.id = entity_id
      and (
        (an.class_id is null and current_status() = 'active' and an.status = 'active')
        or (is_enrolled(an.class_id) and an.status = 'active')
        or teaches_class(an.class_id)
      )
    )
  )
);

drop policy if exists comments_insert on comments;
create policy comments_insert on comments for insert with check (
  is_active_admin()
  or (
    author_id = (select p.id from profiles p where p.auth_user_id = auth.uid())
    and (
      (
        entity_type = 'submission'
        and exists (
          select 1 from submissions s
          where s.id = entity_id
          and (
            s.student_id = (select p.id from profiles p where p.auth_user_id = auth.uid())
            or exists (select 1 from assignments a where a.id = s.assignment_id and teaches_class(a.class_id))
            or mentors_student(s.student_id)
          )
        )
      )
      or (
        entity_type = 'resource'
        and exists (
          select 1 from resources r
          where r.id = entity_id
          and (teaches_class(r.class_id) or (is_enrolled(r.class_id) and r.status = 'active'))
        )
      )
      or (
        entity_type = 'meet'
        and exists (
          select 1 from meet_links m
          where m.id = entity_id
          and (m.class_id is null or teaches_class(m.class_id) or is_enrolled(m.class_id))
        )
      )
      or (
        entity_type = 'announcement'
        and exists (
          select 1 from announcements an
          where an.id = entity_id
          and (
            (an.class_id is null and current_status() = 'active' and an.status = 'active')
            or (is_enrolled(an.class_id) and an.status = 'active')
            or teaches_class(an.class_id)
          )
        )
      )
    )
  )
);

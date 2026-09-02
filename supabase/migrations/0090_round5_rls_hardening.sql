-- 0090_round5_rls_hardening.sql
-- Round-5 security fixes: move app-only controls into the database, where PostgREST is
-- directly reachable with the publishable key + a user JWT.
--
--  * N-03 (HIGH): mentee_notes tenure filter was app-only; the RLS read policy let a
--    current mentor pull the FULL pastoral history via direct PostgREST. Push the
--    tenure/author predicate into the policy.
--  * Reminders (HIGH): the assignee could rewrite created_by (the trigger's personal-
--    reminder shortcut read NEW, and the table had blanket ALL to authenticated). Fix the
--    trigger to test OLD and check immutability first, and REVOKE ALL + grant only the
--    columns each role may write - created_by/user_id/class_id become non-updatable.
--  * W-04 (MEDIUM): reminders_insert never tied the assignee to the class, so a tutor
--    could post a reminder onto ANY profile. Require the assignee be enrolled.
--  * W-10 (LOW): add the http/https scheme CHECK to the last two link columns.
--
-- Depends on 0078 (mentee_notes), 0086 (assigned reminders), 0084 (is_http_link),
-- 0043 (mentors_student / persona scope enum), 0003 (meet_links), 0024 (notifications).

begin;

-- ── N-03: pastoral-note read scoped to the mentor's OWN tenure at the DB boundary ──────
drop policy if exists mentee_notes_read on mentee_notes;
create policy mentee_notes_read on mentee_notes for select using (
  is_active_admin()
  or (
    mentors_student(student_id)
    and (
      author_id = current_profile_id()
      or created_at >= coalesce(
        (
          select min(pa.assigned_at)
          from persona_assignments pa
          where pa.profile_id = current_profile_id()
            and pa.persona_name = 'mentor'
            and pa.scope_type = 'student'::persona_scope_type
            and pa.scope_id = mentee_notes.student_id
            and pa.status = 'active'
        ),
        'infinity'::timestamptz
      )
    )
  )
);

-- ── Reminders: fix the column guard (test OLD; immutability first) ─────────────────────
create or replace function guard_assigned_reminder_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_active_admin() then
    return new;
  end if;
  -- Identity columns are immutable on ANY non-admin update - checked FIRST so an assignee
  -- can't set new.created_by = new.user_id to slip past the personal-reminder shortcut.
  if new.created_by is distinct from old.created_by
     or new.user_id is distinct from old.user_id
     or new.class_id is distinct from old.class_id then
    raise exception 'reminder ownership is immutable';
  end if;
  -- Personal reminder (by the ORIGINAL row): owner has full control.
  if old.created_by = old.user_id then
    return new;
  end if;
  -- The creator of an assigned reminder may edit it freely.
  if public.current_profile_id() = old.created_by then
    return new;
  end if;
  -- Otherwise the actor is the assignee: only a mark-done (is_sent false->true) is allowed.
  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.remind_at is distinct from old.remind_at then
    raise exception 'assignee may only mark an assigned reminder done';
  end if;
  if old.is_sent and not new.is_sent then
    raise exception 'assignee may not reopen a completed reminder';
  end if;
  return new;
end;
$$;
revoke all on function guard_assigned_reminder_columns() from public;

-- ── W-04: an assigned reminder's target must be ENROLLED in its class ──────────────────
drop policy if exists reminders_insert on reminders;
create policy reminders_insert on reminders for insert with check (
  is_self_active(created_by)
  and (
    user_id = created_by
    or (
      class_id is not null
      and teaches_class(class_id)
      and exists (
        select 1 from enrollments e
        where e.student_id = reminders.user_id and e.class_id = reminders.class_id and e.active
      )
    )
  )
);

-- ── Reminders column grants: created_by/user_id/class_id are set at INSERT and then
--    immutable, so they are NOT grantable for UPDATE - closing the PATCH-created_by hole at
--    the privilege layer, not only the trigger. Matches the profiles/submissions pattern. ──
revoke all on table reminders from authenticated;
grant select on table reminders to authenticated;
grant insert (user_id, created_by, class_id, title, description, remind_at, is_sent) on table reminders to authenticated;
grant update (title, description, remind_at, is_sent, completed_at) on table reminders to authenticated;
grant delete on table reminders to authenticated;

-- ── W-10: the remaining link columns get the same scheme CHECK as the drive links ─────
alter table meet_links add constraint meet_links_url_scheme check (is_http_link(url));
alter table notifications add constraint notifications_link_scheme check (is_http_link(link));

commit;

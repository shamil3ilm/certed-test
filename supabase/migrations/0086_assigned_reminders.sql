-- 0086_assigned_reminders.sql
-- Extend personal reminders into optionally-ASSIGNED reminders: a tutor/mentor may set a
-- reminder ON a student. Personal reminders (created_by = user_id) keep full owner control.
-- An ASSIGNED reminder (created_by <> user_id) is READ + MARK-DONE-ONLY for the assignee
-- (user_id = the student) and fully managed by its creator (created_by = the tutor/mentor).
--
-- The reminders stack runs under the RLS client, so RLS is the gate. The single FOR ALL
-- policy is split per-verb, and a BEFORE UPDATE trigger restricts the assignee to flipping
-- is_sent false->true (no edit, no reopen), mirroring guard_profile_privileged_columns (0080).
--
-- Depends on 0006 (reminders), 0011 (is_self_active), 0043 (teaches_class), 0039
-- (current_profile_id), 0001 (profiles), 0007-ish (classes).

begin;

alter table reminders
  add column created_by uuid references profiles(id) on delete cascade,
  add column class_id uuid references classes(id) on delete set null,
  add column completed_at timestamptz;

-- Every existing reminder is personal: its creator is its owner.
update reminders set created_by = user_id where created_by is null;
alter table reminders alter column created_by set not null;

-- Backward-compatible default: any insert that omits created_by (every existing personal
-- path - the app, the seed, the mock) is a PERSONAL reminder, so default created_by to the
-- owner. An assigned insert sets created_by explicitly. Runs BEFORE the NOT NULL check.
create or replace function default_reminder_creator() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.created_by is null then
    new.created_by := new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function default_reminder_creator() from public;
drop trigger if exists trg_default_reminder_creator on reminders;
create trigger trg_default_reminder_creator
  before insert on reminders
  for each row execute function default_reminder_creator();

create index if not exists reminders_created_by_idx on reminders (created_by);
-- Assignee's pending list (dashboard reads user_id + is_sent).
create index if not exists reminders_assignee_pending_idx on reminders (user_id, is_sent);

-- Per-verb policies replace the single FOR ALL gate.
drop policy if exists reminders_all on reminders;

-- READ: the assignee sees reminders targeted at them; the creator sees ones they made.
create policy reminders_select on reminders for select using (
  is_self_active(user_id) or is_self_active(created_by)
);

-- INSERT: the creator must be the acting user. A personal reminder targets self. An
-- ASSIGNED reminder (user_id <> created_by) requires the creator to hold write authority
-- over the class (teaches_class = tutor of, or mentor of an enrolled student in, the class)
-- and to carry that class_id; the create action additionally confirms the assignee is
-- enrolled there.
create policy reminders_insert on reminders for insert with check (
  is_self_active(created_by)
  and (
    user_id = created_by
    or (class_id is not null and teaches_class(class_id))
  )
);

-- UPDATE: both parties may reach the row; the guard trigger restricts WHICH columns the
-- assignee may change.
create policy reminders_update on reminders for update using (
  is_self_active(user_id) or is_self_active(created_by)
) with check (
  is_self_active(user_id) or is_self_active(created_by)
);

-- DELETE: creator only (on a personal reminder creator = owner) - never the assignee.
create policy reminders_delete on reminders for delete using (
  is_self_active(created_by)
);

-- Column guard for the assignee of an ASSIGNED reminder: only a mark-done (is_sent
-- false->true, plus completed_at) is permitted. Admin and the creator are unrestricted;
-- a personal reminder (created_by = user_id) is unrestricted for its owner.
create or replace function guard_assigned_reminder_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_active_admin() then
    return new;
  end if;
  if new.created_by = new.user_id then
    return new; -- personal reminder: owner has full control
  end if;
  if public.current_profile_id() = old.created_by then
    return new; -- the creator may edit an assigned reminder freely
  end if;
  -- Otherwise the actor is the assignee: only a mark-done is allowed.
  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.remind_at is distinct from old.remind_at
     or new.created_by is distinct from old.created_by
     or new.user_id is distinct from old.user_id
     or new.class_id is distinct from old.class_id then
    raise exception 'assignee may only mark an assigned reminder done';
  end if;
  if old.is_sent and not new.is_sent then
    raise exception 'assignee may not reopen a completed reminder';
  end if;
  return new;
end;
$$;
revoke all on function guard_assigned_reminder_columns() from public;

drop trigger if exists trg_guard_assigned_reminder_columns on reminders;
create trigger trg_guard_assigned_reminder_columns
  before update on reminders
  for each row execute function guard_assigned_reminder_columns();

commit;

-- 0125: a person can mute the kinds of notice they do not want.
--
-- Everyone a change concerns is now told (workflow-invariants 4.9), which is right and also loud:
-- a mentor with several mentees hears about every attendance mark. A mute is one row, "this
-- person does not want this kind of notice", read by the one function that writes notifications
-- so the in-app row and its email both go quiet together.
--
-- Only the kinds that are classroom activity can be muted. What happens to an ACCOUNT, its
-- CREDENTIALS, its MONEY or a MENTORSHIP is never optional, so the check below names the
-- mutable kinds rather than excluding the others: a kind added later is unmutable until someone
-- decides otherwise. 'attendance_present' is not a stored notification kind - it is the mute key
-- for the routine "marked present" notice, so a mentor can silence that and still hear about an
-- absence or a late arrival.

begin;

create table if not exists notification_mutes (
  profile_id uuid not null references profiles(id) on delete cascade,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, key),
  constraint notification_mutes_key_check check (key in (
    'message', 'announcement', 'assignment', 'grade', 'submission', 'resource',
    'schedule', 'attendance', 'attendance_present', 'class'
  ))
);

comment on table notification_mutes is
  'One row per (person, kind of notice) the person has muted. Read by notify(); never by the browser for anyone but themselves.';

alter table notification_mutes enable row level security;

-- Each person manages only their own rows, and only while their account is active (0011).
drop policy if exists notification_mutes_own on notification_mutes;
create policy notification_mutes_own on notification_mutes for all
  using (is_self_active(profile_id))
  with check (is_self_active(profile_id));

commit;

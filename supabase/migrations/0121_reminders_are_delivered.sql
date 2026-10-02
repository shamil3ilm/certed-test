-- 0121: a reminder is actually delivered.
--
-- reminders.remind_at has always recorded WHEN, and nothing ever read it. The reminder sat on
-- the dashboard waiting to be noticed, which is the one thing a reminder must not do: the
-- person has to already be looking at the place it is trying to send them.
--
-- is_sent could not be reused as the delivery marker. It is the OWNER'S OWN done tick, paired
-- with completed_at since 0086 - so marking a reminder "sent" when we notified them would tick
-- it off on their behalf and drop it out of their outstanding list.
--
-- notified_at is therefore separate: null means not yet delivered. The sweep claims rows by
-- stamping it, so two overlapping passes cannot both deliver the same reminder.

begin;

alter table reminders add column if not exists notified_at timestamptz;

comment on column reminders.notified_at is
  'When the sweep notified the owner. NULL = not yet delivered. Distinct from is_sent, which is the owner''s own done tick.';

-- The sweep's scan: due, undelivered, and not already ticked off. Partial, so it stays small as
-- delivered reminders accumulate - the rows it indexes are only ever the outstanding ones.
create index if not exists reminders_due_idx
  on reminders (remind_at)
  where notified_at is null and not is_sent;

commit;

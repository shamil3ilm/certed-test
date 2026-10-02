-- 0122: an assignment's due date reaches the people it is due from.
--
-- Posting an assignment notifies the class (assignments/commands.ts). The DEADLINE notifies
-- nobody: due_date is read to sort a dashboard widget and to close submissions, so a student
-- learns their work is due by happening to look on the right day.
--
-- Same marker as reminders (0121), for the same reason: the sweep stamps the row it has taken,
-- so two overlapping passes cannot both notify one assignment, and a pass that dies mid-batch
-- leaves the rest to the next one. It is NOT a "students were told" flag on each student - one
-- stamp per assignment, per the one notice it sends.
--
-- Deliberately not backfilled: every existing assignment starts NULL, and the first sweep
-- therefore notices only assignments falling due inside its window from now on. An assignment
-- already past its due date is outside that window and stays silent, which is right - telling
-- someone their work was due last week is not a reminder, it is a reproach.

begin;

alter table assignments add column if not exists due_notified_at timestamptz;

comment on column assignments.due_notified_at is
  'When the sweep told the class this assignment was falling due. NULL = not yet told.';

-- The sweep's scan: active assignments not yet announced as due. Partial, so the index holds
-- only the ones still capable of producing a notice.
create index if not exists assignments_due_soon_idx
  on assignments (due_date)
  where due_notified_at is null and status = 'active';

commit;

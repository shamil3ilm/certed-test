-- 0124: a scheduled announcement tells its class when it goes live.
--
-- An announcement can be given a publish_at in the future. Posting it notifies nobody (it is not
-- live yet, announcements/commands.ts), and nothing notified anyone when the time arrived: the
-- class found it by happening to open the stream. This is the marker the sweep needs, same shape
-- as reminders (0121) and assignments (0122): the sweep stamps the row it has taken, so two
-- overlapping passes cannot both announce one post, and a pass that dies mid-batch leaves the rest
-- to the next.
--
-- One stamp per announcement, set by whichever path told the class: the sweep, or the write that
-- posted it live. That second part is what keeps a post written live with a publish_at already
-- in the past (or restored after going live) from being announced a second time.

begin;

alter table announcements add column if not exists live_notified_at timestamptz;

comment on column announcements.live_notified_at is
  'When the class was told this announcement is live. NULL = not yet told (a scheduled post, or an academy-wide one, which is never fanned out).';

-- Posts that were already live when this ships have been seen; marking them keeps the first sweep
-- from announcing the whole backlog. Only a publish_at in the past can be a candidate for the sweep
-- (a NULL publish_at is live from creation and is announced by the write itself), so that is the
-- set to mark. Posts still waiting on a FUTURE publish_at stay NULL and are announced when due.
update announcements
   set live_notified_at = coalesce(publish_at, created_at)
 where live_notified_at is null
   and publish_at is not null
   and publish_at <= now();

-- The sweep's scan: active class posts that have a publish time and have not been announced.
-- Partial, so the index holds only the posts still capable of producing a notice.
create index if not exists announcements_go_live_idx
  on announcements (publish_at)
  where live_notified_at is null and status = 'active' and class_id is not null and publish_at is not null;

commit;

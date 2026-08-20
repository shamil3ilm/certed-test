-- 0066: claim email-queue rows atomically so overlapping drains can't double-send.
--
-- The drain (GET /api/cron/drain-emails) SELECTed the oldest pending rows and sent
-- them, flipping status only AFTER each send. A pass that ran longer than its cron
-- interval left rows 'pending' the whole time, so the next pass re-selected and
-- re-sent them - duplicate email to a named recipient. This adds an in-flight
-- 'sending' state and a claim function that hands each concurrent drain a DISJOINT
-- batch via FOR UPDATE SKIP LOCKED, and a claimed_at stamp so a crashed pass's rows
-- can be reaped back to 'pending'.

begin;

-- Widen the status check to include the in-flight 'sending' state.
alter table pending_emails drop constraint if exists pending_emails_status_check;
alter table pending_emails
  add constraint pending_emails_status_check check (status in ('pending', 'sending', 'sent', 'failed'));

-- When a row was claimed - lets the reaper find rows a dead drain left mid-send.
alter table pending_emails add column if not exists claimed_at timestamptz;

-- Reaper scan support: rows stuck 'sending' past their lease. Small partial index.
create index if not exists pending_emails_sending_idx on pending_emails (claimed_at) where status = 'sending';

commit;

-- Atomic claim: flip the oldest N pending rows to 'sending' and return them. Two
-- concurrent drains get disjoint batches because SKIP LOCKED steps over rows the
-- other has already locked inside its own UPDATE, instead of blocking on them.
-- Service-role only (the drain runs through the admin client); mirrors the RPC
-- lock-down in 0034.
create or replace function claim_pending_emails(p_limit int)
returns setof pending_emails
language sql
security definer
set search_path = public
as $$
  update pending_emails
     set status = 'sending', claimed_at = now()
   where id in (
     select id from pending_emails
      where status = 'pending'
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning *;
$$;

revoke execute on function claim_pending_emails(int) from public, anon, authenticated;
grant execute on function claim_pending_emails(int) to service_role;

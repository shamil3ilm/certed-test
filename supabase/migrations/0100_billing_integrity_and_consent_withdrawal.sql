-- 0100: billing integrity (C-05, C-06) and consent withdrawal (N-07).
--
-- NOTE ON COLUMN NAMES: the finance tables do NOT have a `party_id`. `receipts` keys the
-- payee/payer as `student_id` and `payslips` as `tutor_id`; `p_party_id` exists only as an
-- RPC PARAMETER (0013/0019/0095) and `party_id` only as a DTO field synthesised in
-- src/lib/data/finance-docs-shared.ts. 0095's own indexes use the real columns.

-- ── C-05: nothing stopped the same party+period being billed twice ────────────
-- The duplicate-month check lived in the browser, so it was defeated by omitting
-- billing_period, and two concurrent issues for the same party and month both
-- succeeded - there was no unique constraint and no lock. A financial document is
-- exactly the kind of record that must not be creatable twice by a double-click.
--
-- Partial, so it constrains only what it should:
--   * billing_period IS NOT NULL - a hand-written document that bills no particular
--     month stays valid and unconstrained, which is the documented intent of the
--     nullable column.
--   * NOT voided - voiding is the correction path (the model is immutable: void +
--     reissue), so a voided document must never block the corrected reissue.
create unique index if not exists receipts_one_live_per_party_period
  on receipts (student_id, billing_period)
  where billing_period is not null and voided = false;

create unique index if not exists payslips_one_live_per_party_period
  on payslips (tutor_id, billing_period)
  where billing_period is not null and voided = false;

-- ── C-06: the payee writes the hours that become their own pay ───────────────
-- Pay is sum(actual_end - actual_start) grouped by tutor_id, and a tutor records their
-- own sessions on their own attribution. The 24-hour cap and the overlap check bound a
-- SINGLE session, not a month of non-overlapping ones, and nothing froze the inputs once
-- they had been paid out - so the hours behind an issued pay slip stayed editable by the
-- person the pay slip paid.
--
-- Full separation of duties (a non-payee confirming each session) is a workflow change.
-- This is the half that needs no workflow and closes the after-the-fact edit: once a
-- LIVE pay slip bills a month, the hour-bearing fields of that payee's sessions in that
-- month are frozen. Voiding the pay slip unfreezes them, which is the existing
-- correction path (void + reissue) rather than a new one.
--
-- In the DATABASE, not the service layer: these columns are otherwise reachable by any
-- writer, and an application-level guard is bypassed by a direct PostgREST call.
create or replace function guard_billed_session_hours() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  billed_number text;
begin
  -- Only the fields that determine pay. Summary, feedback and staff notes stay editable
  -- after issuance: they are the pastoral record, and freezing them would lose detail
  -- that is often written up later.
  if new.actual_start is not distinct from old.actual_start
     and new.actual_end is not distinct from old.actual_end
     and new.tutor_id is not distinct from old.tutor_id then
    return new;
  end if;

  -- The month this session belongs to, matched against a live pay slip for its payee.
  select p.number into billed_number
  from payslips p
  where p.voided = false
    and p.billing_period = to_char(old.session_date, 'YYYY-MM')
    and p.tutor_id = old.tutor_id
  limit 1;

  if billed_number is not null then
    raise exception
      'Session hours are locked: pay slip % already billed % for this payee. Void it first, then correct and reissue.',
      billed_number, to_char(old.session_date, 'YYYY-MM')
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

revoke execute on function guard_billed_session_hours() from public, anon, authenticated;
grant execute on function guard_billed_session_hours() to service_role;

drop trigger if exists class_sessions_guard_billed_hours on class_sessions;
create trigger class_sessions_guard_billed_hours
  before update on class_sessions
  for each row execute function guard_billed_session_hours();

-- ── N-07: consent could be given but never withdrawn ─────────────────────────
-- The privacy policy offers withdrawal; the schema had no way to express it, so the
-- append-only log could only ever say "accepted". A nullable marker keeps the log
-- append-only (the acceptance row remains, unedited, as the historical fact) while
-- recording that the person later withdrew and when.
alter table consents add column if not exists withdrawn_at timestamp with time zone;

comment on column consents.withdrawn_at is
  'When this acceptance was withdrawn, or NULL while it stands. The row is never deleted: '
  'the acceptance remains the historical fact, and this records that it was later revoked.';

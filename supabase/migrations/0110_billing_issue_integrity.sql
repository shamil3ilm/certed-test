-- 0110: a finance document bills the hours that are recorded when it commits, and a
-- double-submitted document is refused whatever path issues it.
--
-- 1. Hours could change DURING an issue.
--    The service built the draft (hours per class, from recorded sessions and attendance), checked
--    the request against it, and only then called issue_*_doc. A session edited between the draft
--    and the insert was billed at its old figure; for a pay slip, the billed-hours guard then froze
--    the NEW figure under a document that does not show it. The guard could not stop the edit
--    either: it looks for a live pay slip, and the one being issued had not committed yet.
--
--    Now the service reads a FINGERPRINT of the billing source before building the draft - the
--    count, total window and class/subject of every session (and, for a receipt, every attended
--    mark) the month's figure is made of - and passes it to the issue function. Under a lock on
--    the party, the function recomputes it and refuses the issue if anything changed. The
--    billed-hours guard takes the same lock, so a session edit either commits before the issue
--    looks (and is caught by the fingerprint) or waits for the issue and then sees its pay slip.
--
-- 2. The billed-hours guard checked the wrong month, and only one payee.
--    It matched a pay slip by to_char(session_date), but a month's hours are the sessions whose
--    actual_start falls in that month in the INSTITUTE time zone (monthWindow in the app). A late
--    session near a month edge was frozen under one month and billed under the other. And on an
--    UPDATE it checked only the OLD payee and month, so moving a session ONTO a payee whose month
--    is already paid - or across a month boundary into one - changed billed hours unchecked. It
--    now checks the month each side of the change bills under, for each payee it touches.
--
-- 3. The double-submit guard ran outside the write.
--    A document with no billing period has no unique index behind it (0100's are partial on
--    billing_period), and the "identical document issued moments ago" check was a read before the
--    insert: two concurrent submits both passed it. It now runs inside the issue function, under
--    the same per-party lock.
--
-- Refusals are raised as codes the service maps to messages:
--   billing_source_changed      the recorded hours moved since the draft was built
--   billing_source_required     a billing-period document was issued without a fingerprint
--   duplicate_recent:<number>   an identical live document was issued in the last 2 minutes

begin;

-- ── the institute month an instant falls in ────────────────────────────────

create or replace function institute_month(p_instant timestamptz) returns text
language sql
stable
set search_path = public
as $$
  select to_char(
    p_instant at time zone coalesce(
      (select s.timezone from org_settings s
        where exists (select 1 from pg_timezone_names z where z.name = s.timezone)
        limit 1),
      'Asia/Kolkata'),
    'YYYY-MM');
$$;

-- ── the billed-hours guard ──────────────────────────────────────────────────

create or replace function assert_session_hours_unbilled(p_tutor_id uuid, p_month text) returns void
language plpgsql
set search_path = public
as $$
declare
  v_number text;
begin
  if p_tutor_id is null or p_month is null then
    return;
  end if;
  -- The key issue_payslip_doc takes for this payee.
  perform pg_advisory_xact_lock(hashtextextended('finance-issue:payslip:' || p_tutor_id::text, 0));
  select number into v_number
    from payslips
   where voided = false and billing_period = p_month and tutor_id = p_tutor_id
   limit 1;
  if v_number is not null then
    raise exception
      'Session hours are locked: pay slip % already billed % for this payee. Void it first, then correct and reissue.',
      v_number, p_month
      using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function guard_billed_session_hours() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_tutor uuid;
  v_old_month text;
  v_new_tutor uuid;
  v_new_month text;
begin
  if tg_op = 'UPDATE'
     and new.actual_start is not distinct from old.actual_start
     and new.actual_end is not distinct from old.actual_end
     and new.tutor_id is not distinct from old.tutor_id then
    -- Only the fields that determine pay. Summary, feedback and staff notes stay editable
    -- after issuance: they are the pastoral record, often written up later.
    return new;
  end if;

  -- A session counts toward the month its recorded start falls in; one with no start
  -- counts toward none.
  if tg_op <> 'INSERT' and old.actual_start is not null then
    v_old_tutor := old.tutor_id;
    v_old_month := institute_month(old.actual_start);
  end if;
  if tg_op <> 'DELETE' and new.actual_start is not null then
    v_new_tutor := new.tutor_id;
    v_new_month := institute_month(new.actual_start);
  end if;

  -- Both sides, locked in a fixed order so two sessions moved in opposite directions
  -- between two payees cannot deadlock.
  if v_new_tutor is not null and (v_old_tutor is null or v_new_tutor::text < v_old_tutor::text) then
    perform assert_session_hours_unbilled(v_new_tutor, v_new_month);
    perform assert_session_hours_unbilled(v_old_tutor, v_old_month);
  else
    perform assert_session_hours_unbilled(v_old_tutor, v_old_month);
    perform assert_session_hours_unbilled(v_new_tutor, v_new_month);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ── the billing-source fingerprint ──────────────────────────────────────────

-- Everything a month's figure for one party is computed from, over the window the app bills:
-- sessions whose recorded start is in [p_from, p_to), in classes that are not archived. For a
-- pay slip, the payee's sessions; for a receipt, the student's present/late marks on them.
create or replace function billing_source_fingerprint(
  p_kind text,
  p_party_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_source text;
begin
  if p_kind = 'payslip' then
    select count(*)::text || '|' ||
           coalesce(sum(extract(epoch from (s.actual_end - s.actual_start))), 0)::text || '|' ||
           coalesce(string_agg(s.id::text || ':' || s.class_id::text || ':' || coalesce(s.subject_id::text, '')
                               || ':' || coalesce(s.actual_end::text, ''), ',' order by s.id), '')
      into v_source
      from class_sessions s
      join classes c on c.id = s.class_id
     where s.tutor_id = p_party_id
       and s.actual_start >= p_from and s.actual_start < p_to
       and c.status <> 'archived';
  elsif p_kind = 'receipt' then
    select count(*)::text || '|' ||
           coalesce(sum(extract(epoch from (s.actual_end - s.actual_start))), 0)::text || '|' ||
           coalesce(string_agg(s.id::text || ':' || s.class_id::text || ':' || coalesce(s.subject_id::text, '')
                               || ':' || coalesce(s.actual_end::text, ''), ',' order by s.id), '')
      into v_source
      from attendance a
      join class_sessions s on s.id = a.session_id
      join classes c on c.id = s.class_id
     where a.student_id = p_party_id
       and a.status in ('present', 'late')
       and s.actual_start >= p_from and s.actual_start < p_to
       and c.status <> 'archived';
  else
    raise exception 'invalid_kind';
  end if;
  return md5(v_source);
end;
$$;

-- ── issue functions ─────────────────────────────────────────────────────────

-- Shared pre-insert checks. Takes the per-party lock the billed-hours guard also takes.
create or replace function assert_issue_allowed(
  p_kind text,
  p_party_id uuid,
  p_currency text,
  p_total numeric,
  p_billing_period text,
  p_source_fingerprint text,
  p_source_from timestamptz,
  p_source_to timestamptz
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_number text;
begin
  perform pg_advisory_xact_lock(hashtextextended('finance-issue:' || p_kind || ':' || p_party_id::text, 0));

  if p_billing_period is not null then
    if p_source_fingerprint is null or p_source_from is null or p_source_to is null then
      raise exception 'billing_source_required';
    end if;
    if billing_source_fingerprint(p_kind, p_party_id, p_source_from, p_source_to) <> p_source_fingerprint then
      raise exception 'billing_source_changed';
    end if;
    return;
  end if;

  -- A document that bills no particular month: refuse its identical twin issued moments ago.
  -- A double-submit guard, not a uniqueness rule - two genuinely separate documents for one
  -- party are legitimate, so the window is short.
  if p_kind = 'receipt' then
    select number into v_number from receipts
     where student_id = p_party_id and not voided and billing_period is null
       and currency = p_currency and total = p_total and created_at > now() - interval '2 minutes'
     order by created_at desc limit 1;
  else
    select number into v_number from payslips
     where tutor_id = p_party_id and not voided and billing_period is null
       and currency = p_currency and total = p_total and created_at > now() - interval '2 minutes'
     order by created_at desc limit 1;
  end if;
  if v_number is not null then
    raise exception 'duplicate_recent:%', v_number;
  end if;
end;
$$;

drop function if exists public.issue_receipt_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text);

create or replace function public.issue_receipt_doc(
  p_party_id uuid, p_party_name text, p_class_level text, p_issue_date date, p_currency text,
  p_note text, p_subtotal numeric, p_discount numeric, p_total numeric, p_created_by uuid,
  p_prefix text, p_lines jsonb, p_billing_period text default null,
  p_source_fingerprint text default null, p_source_from timestamptz default null, p_source_to timestamptz default null
) returns public.receipts
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_year int;
  v_number text;
  v_counter int;
  v_receipt receipts%rowtype;
begin
  perform assert_issue_allowed('receipt', p_party_id, p_currency, p_total, p_billing_period,
                               p_source_fingerprint, p_source_from, p_source_to);

  v_year := extract(year from p_issue_date);
  v_counter := next_document_number('receipt', v_year);
  v_number := p_prefix || '-' || v_year || '-' || lpad(v_counter::text, 4, '0');

  insert into receipts (
    number, student_id, student_name_snapshot, class_snapshot, issue_date, currency, note,
    subtotal, discount, total, voided, created_by, billing_period
  ) values (
    v_number, p_party_id, p_party_name, p_class_level, p_issue_date, p_currency, p_note,
    p_subtotal, p_discount, p_total, false, p_created_by, p_billing_period
  )
  returning * into v_receipt;

  insert into receipt_lines (receipt_id, subject, hours, rate, amount)
  select
    v_receipt.id,
    item->>'label',
    (item->>'hours')::numeric,
    (item->>'rate')::numeric,
    (item->>'amount')::numeric
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) item;

  return v_receipt;
end;
$$;

drop function if exists public.issue_payslip_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text);

create or replace function public.issue_payslip_doc(
  p_party_id uuid, p_party_name text, p_class_level text, p_issue_date date, p_currency text,
  p_note text, p_subtotal numeric, p_discount numeric, p_total numeric, p_created_by uuid,
  p_prefix text, p_lines jsonb, p_billing_period text default null,
  p_source_fingerprint text default null, p_source_from timestamptz default null, p_source_to timestamptz default null
) returns public.payslips
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_year int;
  v_number text;
  v_counter int;
  v_payslip payslips%rowtype;
begin
  -- p_class_level is accepted but unused: pay slips carry no class snapshot. The parameter
  -- stays so both issue functions keep one shared call shape in the data layer.
  perform assert_issue_allowed('payslip', p_party_id, p_currency, p_total, p_billing_period,
                               p_source_fingerprint, p_source_from, p_source_to);

  v_year := extract(year from p_issue_date);
  v_counter := next_document_number('payslip', v_year);
  v_number := p_prefix || '-' || v_year || '-' || lpad(v_counter::text, 4, '0');

  insert into payslips (
    number, tutor_id, tutor_name_snapshot, issue_date, currency, note,
    subtotal, discount, total, voided, created_by, billing_period
  ) values (
    v_number, p_party_id, p_party_name, p_issue_date, p_currency, p_note,
    p_subtotal, p_discount, p_total, false, p_created_by, p_billing_period
  )
  returning * into v_payslip;

  insert into payslip_lines (payslip_id, label, hours, rate, amount)
  select
    v_payslip.id,
    item->>'label',
    (item->>'hours')::numeric,
    (item->>'rate')::numeric,
    (item->>'amount')::numeric
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) item;

  return v_payslip;
end;
$$;

-- The minting functions do not self-authorize (C-01), so EXECUTE is the whole control.
revoke execute on function public.issue_receipt_doc(
  uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.issue_receipt_doc(
  uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text, text, timestamptz, timestamptz
) to service_role;
revoke execute on function public.issue_payslip_doc(
  uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.issue_payslip_doc(
  uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text, text, timestamptz, timestamptz
) to service_role;
revoke execute on function billing_source_fingerprint(text, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function billing_source_fingerprint(text, uuid, timestamptz, timestamptz) to service_role;
revoke execute on function assert_issue_allowed(text, uuid, text, numeric, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function assert_session_hours_unbilled(uuid, text) from public, anon, authenticated;
revoke execute on function institute_month(timestamptz) from public, anon, authenticated;
revoke execute on function guard_billed_session_hours() from public, anon, authenticated;
grant execute on function guard_billed_session_hours() to service_role;

commit;

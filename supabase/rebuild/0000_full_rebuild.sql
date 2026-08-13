-- ============================================================================
-- Cert-Ed Academia - full schema rebuild
-- ============================================================================
-- GENERATED from the numbered migrations (supabase/migrations/0001..0060) via
-- pg_dump of the fully-migrated schema. The numbered migrations are the single
-- source of truth; this file provisions a fresh database in one shot and is kept
-- byte-identical to applying them in order. DO NOT hand-edit - re-dump instead.
--
-- Requires the Supabase-provided `auth` schema (auth.users, auth.uid()) and the
-- anon / authenticated / service_role roles, present on any Supabase project.
-- ============================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.0
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: calendar_event_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_event_kind AS ENUM (
    'event',
    'holiday',
    'cancellation',
    'reschedule'
);


--
-- Name: conversation_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.conversation_kind AS ENUM (
    'direct',
    'group'
);


--
-- Name: document_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_category AS ENUM (
    'question_papers',
    'practice_sheets',
    'academic_resources',
    'general_documents'
);


--
-- Name: document_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_visibility AS ENUM (
    'class',
    'staff'
);


--
-- Name: persona_name; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.persona_name AS ENUM (
    'admin',
    'sub_admin',
    'tutor',
    'mentor',
    'student',
    'guardian',
    'finance_operator',
    'assistant',
    'executive'
);


--
-- Name: persona_scope_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.persona_scope_type AS ENUM (
    'global',
    'class',
    'student',
    'finance',
    'reporting'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'tutor',
    'student',
    'sub_admin',
    'mentor'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status AS ENUM (
    'active',
    'pending',
    'disabled'
);


--
-- Name: current_app_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_app_role() RETURNS public.user_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role from profiles where auth_user_id = auth.uid()
$$;


--
-- Name: current_profile_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_profile_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from profiles where auth_user_id = auth.uid() and status = 'active'
$$;


--
-- Name: current_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_status() RETURNS public.user_status
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select status from profiles where auth_user_id = auth.uid()
$$;


--
-- Name: edit_assignment_and_reclassify(uuid, text, text, timestamp with time zone, text, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.edit_assignment_and_reclassify(p_id uuid, p_title text, p_description text, p_due_date timestamp with time zone, p_attachment_drive_link text, p_topic text, p_max_marks numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update assignments set
    title = p_title,
    description = p_description,
    due_date = p_due_date,
    attachment_drive_link = p_attachment_drive_link,
    topic = p_topic,
    max_marks = p_max_marks
  where id = p_id;

  if not found then
    raise exception 'assignment % not found', p_id;
  end if;

  -- Re-derive lateness against the new deadline, matching set_submission_status()
  -- (0009) and the app's computeStatus: submitted AFTER the due instant is 'late',
  -- at-or-before is 'submitted'. Only rows whose verdict actually changes are
  -- written.
  update submissions set
    status = case when submitted_at > p_due_date then 'late' else 'submitted' end
  where assignment_id = p_id
    and status <> (case when submitted_at > p_due_date then 'late' else 'submitted' end);
end;
$$;


--
-- Name: finance_totals(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finance_totals(p_kind text) RETURNS TABLE(currency text, live_total numeric, live_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select r.currency, coalesce(sum(r.total), 0)::numeric, count(*)::bigint
  from receipts r
  where p_kind = 'receipt' and r.voided = false
  group by r.currency
  union all
  select p.currency, coalesce(sum(p.total), 0)::numeric, count(*)::bigint
  from payslips p
  where p_kind = 'payslip' and p.voided = false
  group by p.currency;
$$;


--
-- Name: finance_totals_base(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finance_totals_base(p_kind text) RETURNS TABLE(base_currency text, base_total numeric, converted_count bigint, unconverted_count bigint)
    LANGUAGE sql STABLE
    AS $$
  select
    (select base_currency from org_settings limit 1),
    coalesce(
      sum(r.base_total) filter (
        where r.base_total is not null
          and r.base_currency = (select base_currency from org_settings limit 1)
      ),
      0
    )::numeric,
    count(*) filter (
      where r.base_total is not null
        and r.base_currency = (select base_currency from org_settings limit 1)
    )::bigint,
    count(*) filter (
      where r.base_total is null
        or r.base_currency is distinct from (select base_currency from org_settings limit 1)
    )::bigint
  from receipts r
  where r.voided = false
  having p_kind = 'receipt'
  union all
  select
    (select base_currency from org_settings limit 1),
    coalesce(
      sum(p.base_total) filter (
        where p.base_total is not null
          and p.base_currency = (select base_currency from org_settings limit 1)
      ),
      0
    )::numeric,
    count(*) filter (
      where p.base_total is not null
        and p.base_currency = (select base_currency from org_settings limit 1)
    )::bigint,
    count(*) filter (
      where p.base_total is null
        or p.base_currency is distinct from (select base_currency from org_settings limit 1)
    )::bigint
  from payslips p
  where p.voided = false
  having p_kind = 'payslip';
$$;


--
-- Name: is_active_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.user_is_admin((select id from profiles where auth_user_id = auth.uid()))
$$;


--
-- Name: is_conversation_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_conversation_member(p_conversation_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists(
    select 1 from conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.profile_id = current_profile_id()
  )
$$;


--
-- Name: is_enrolled(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_enrolled(p_class_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists(
    select 1
    from enrollments e
    join profiles p on p.id = e.student_id
    join persona_assignments pa
      on pa.profile_id = e.student_id
     and pa.persona_name = 'student'::persona_name
     and pa.scope_type = 'global'::persona_scope_type
     and pa.status = 'active'
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
      and e.class_id = p_class_id
      and e.active
  )
$$;


--
-- Name: is_self_active(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_self_active(p_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists(
    select 1 from profiles p
    where p.id = p_id and p.auth_user_id = auth.uid() and p.status = 'active'
  )
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: payslips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payslips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    number text NOT NULL,
    tutor_id uuid,
    tutor_name_snapshot text CONSTRAINT payslips_teacher_name_snapshot_not_null NOT NULL,
    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    currency text NOT NULL,
    note text,
    subtotal numeric(16,3) NOT NULL,
    discount numeric(16,3),
    total numeric(16,3) NOT NULL,
    voided boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    base_currency text,
    base_total numeric(12,2),
    fx_rate numeric(18,8),
    fx_rate_id uuid
);


--
-- Name: issue_payslip_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.issue_payslip_doc(p_party_id uuid, p_party_name text, p_class_level text, p_issue_date date, p_currency text, p_note text, p_subtotal numeric, p_discount numeric, p_total numeric, p_created_by uuid, p_prefix text, p_lines jsonb) RETURNS public.payslips
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_year int;
  v_number text;
  v_counter int;
  v_payslip payslips%rowtype;
begin
  v_year := extract(year from p_issue_date);
  v_counter := next_document_number('payslip', v_year);
  v_number := p_prefix || '-' || v_year || '-' || lpad(v_counter::text, 4, '0');

  insert into payslips (
    number,
    tutor_id,
    tutor_name_snapshot,
    issue_date,
    currency,
    note,
    subtotal,
    discount,
    total,
    voided,
    created_by
  ) values (
    v_number,
    p_party_id,
    p_party_name,
    p_issue_date,
    p_currency,
    p_note,
    p_subtotal,
    p_discount,
    p_total,
    false,
    p_created_by
  )
  returning *
  into v_payslip;

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


--
-- Name: receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    number text NOT NULL,
    student_id uuid,
    student_name_snapshot text NOT NULL,
    class_snapshot text,
    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    currency text NOT NULL,
    note text,
    subtotal numeric(16,3) NOT NULL,
    discount numeric(16,3),
    total numeric(16,3) NOT NULL,
    voided boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    base_currency text,
    base_total numeric(12,2),
    fx_rate numeric(18,8),
    fx_rate_id uuid
);


--
-- Name: issue_receipt_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.issue_receipt_doc(p_party_id uuid, p_party_name text, p_class_level text, p_issue_date date, p_currency text, p_note text, p_subtotal numeric, p_discount numeric, p_total numeric, p_created_by uuid, p_prefix text, p_lines jsonb) RETURNS public.receipts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_year int;
  v_number text;
  v_counter int;
  v_receipt receipts%rowtype;
begin
  v_year := extract(year from p_issue_date);
  v_counter := next_document_number('receipt', v_year);
  v_number := p_prefix || '-' || v_year || '-' || lpad(v_counter::text, 4, '0');

  insert into receipts (
    number,
    student_id,
    student_name_snapshot,
    class_snapshot,
    issue_date,
    currency,
    note,
    subtotal,
    discount,
    total,
    voided,
    created_by
  ) values (
    v_number,
    p_party_id,
    p_party_name,
    p_class_level,
    p_issue_date,
    p_currency,
    p_note,
    p_subtotal,
    p_discount,
    p_total,
    false,
    p_created_by
  )
  returning *
  into v_receipt;

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


--
-- Name: mentors_class(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mentors_class(p_class_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists(
    select 1
    from mentorships m
    join profiles p on p.id = m.mentor_id
    join persona_assignments pa
      on pa.profile_id = m.mentor_id
     and pa.persona_name = 'mentor'::persona_name
     and pa.scope_type = 'student'::persona_scope_type
     and pa.scope_id = m.student_id
     and pa.status = 'active'
    join enrollments e
      on e.student_id = m.student_id
     and e.class_id = p_class_id
     and e.active
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
      and m.active
  )
$$;


--
-- Name: mentors_student(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mentors_student(p_student_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists(
    select 1
    from mentorships m
    join profiles p on p.id = m.mentor_id
    join persona_assignments pa
      on pa.profile_id = m.mentor_id
     and pa.persona_name = 'mentor'::persona_name
     and pa.scope_type = 'student'::persona_scope_type
     and pa.scope_id = m.student_id
     and pa.status = 'active'
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
      and m.student_id = p_student_id
      and m.active
  )
$$;


--
-- Name: next_document_number(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_document_number(p_doc_type text, p_year integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n int;
begin
  insert into document_counters (doc_type, year, last_number)
  values (p_doc_type, p_year, 1)
  on conflict (doc_type, year)
    do update set last_number = document_counters.last_number + 1
  returning last_number into n;
  return n;
end $$;


--
-- Name: rate_limit_hit(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) RETURNS TABLE(allowed boolean, retry_after_seconds integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_now timestamptz := now();
  v_window_started_at timestamptz;
  v_hits integer;
begin
  -- Atomic fixed-window counter: a single upsert both resets an expired window
  -- and increments a live one, so concurrent requests can't race a read/modify.
  insert into public.rate_limit_counters as c (bucket_key, window_started_at, hits)
    values (p_key, v_now, 1)
  on conflict (bucket_key) do update
    set
      window_started_at = case
        when c.window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now
        else c.window_started_at
      end,
      hits = case
        when c.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1
        else c.hits + 1
      end
  returning c.window_started_at, c.hits into v_window_started_at, v_hits;

  if v_hits > p_limit then
    return query
      select
        false,
        greatest(
          1,
          ceil(extract(epoch from (v_window_started_at + make_interval(secs => p_window_seconds) - v_now)))
        )::integer;
  else
    return query select true, 0;
  end if;
end;
$$;


--
-- Name: reclassify_submissions_on_due_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reclassify_submissions_on_due_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.due_date is distinct from old.due_date then
    update submissions set
      status = case when submitted_at > new.due_date then 'late' else 'submitted' end
    where assignment_id = new.id
      and status <> (case when submitted_at > new.due_date then 'late' else 'submitted' end);
  end if;
  return new;
end;
$$;


--
-- Name: submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    student_id uuid NOT NULL,
    drive_link text,
    file_name text,
    status text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    score numeric(6,2),
    feedback text,
    graded_at timestamp with time zone,
    graded_by uuid,
    CONSTRAINT submissions_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'late'::text])))
);


--
-- Name: replace_own_submission(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_own_submission(p_assignment_id uuid, p_drive_link text, p_file_name text DEFAULT NULL::text) RETURNS public.submissions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_assignment assignments%rowtype;
  v_student_id uuid;
  v_current submissions%rowtype;
  v_created submissions%rowtype;
begin
  select *
  into v_assignment
  from assignments
  where id = p_assignment_id and status = 'active';

  if not found then
    raise exception 'assignment_not_found';
  end if;

  select id
  into v_student_id
  from profiles
  where auth_user_id = auth.uid() and status = 'active';

  if v_student_id is null then
    raise exception 'actor_not_active';
  end if;

  if not is_enrolled(v_assignment.class_id) then
    raise exception 'not_enrolled';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_assignment_id::text || ':' || v_student_id::text, 0));

  select *
  into v_current
  from submissions
  where assignment_id = p_assignment_id
    and student_id = v_student_id
    and is_active = true
  for update;

  if found and v_current.score is not null then
    raise exception 'submission_already_graded';
  end if;

  update submissions
  set is_active = false
  where assignment_id = p_assignment_id
    and student_id = v_student_id
    and is_active = true;

  insert into submissions (
    assignment_id,
    student_id,
    drive_link,
    file_name,
    is_active
  ) values (
    p_assignment_id,
    v_student_id,
    p_drive_link,
    p_file_name,
    true
  )
  returning *
  into v_created;

  return v_created;
end;
$$;


--
-- Name: revoke_profile_guarded(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_profile_guarded(p_target uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_role text;
  v_status text;
  v_active_admins int;
begin
  -- Serialize every admin-tier revocation on one constant key, so the
  -- last-admin count and the status flip are a single atomic step across rows.
  perform pg_advisory_xact_lock(hashtextextended('profiles:admin-tier-guard'::text, 0));

  select role, status into v_role, v_status from profiles where id = p_target;
  if not found then
    return 'not_found';
  end if;

  -- Only an ACTIVE admin counts toward the tier; an already-disabled target is
  -- a harmless no-op (mirrors the old isLastActiveAdmin, which returned false
  -- for any target that was not an active admin).
  if v_role = 'admin' and v_status = 'active' then
    select count(*) into v_active_admins
    from profiles
    where role = 'admin' and status = 'active';
    if v_active_admins <= 1 then
      return 'last_admin';
    end if;
  end if;

  update profiles set status = 'disabled' where id = p_target;
  return 'ok';
end;
$$;


--
-- Name: set_submission_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_submission_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare due timestamptz;
begin
  new.submitted_at := now();
  select due_date into due from assignments where id = new.assignment_id;
  new.status := case when due is not null and new.submitted_at > due then 'late' else 'submitted' end;
  return new;
end $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: teaches_class(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.teaches_class(p_class_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists(
    select 1
    from class_tutors ct
    join profiles p on p.id = ct.tutor_id
    join persona_assignments pa
      on pa.profile_id = ct.tutor_id
     and pa.persona_name = 'tutor'::persona_name
     and pa.scope_type = 'global'::persona_scope_type
     and pa.status = 'active'
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
      and ct.class_id = p_class_id
      and ct.active
  )
  or mentors_class(p_class_id)
$$;


--
-- Name: user_has_persona(uuid, public.persona_name, public.persona_scope_type, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_has_persona(p_user_id uuid, p_persona public.persona_name, p_scope_type public.persona_scope_type DEFAULT 'global'::public.persona_scope_type, p_scope_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return exists (
    select 1
    from persona_assignments pa
    join profiles p on p.id = pa.profile_id and p.status = 'active'
    where pa.profile_id = p_user_id
      and pa.persona_name = p_persona
      and pa.scope_type = p_scope_type
      and (
        (p_scope_type = 'global' and pa.scope_id is null) or
        (p_scope_type != 'global' and pa.scope_id = p_scope_id)
      )
      and pa.status = 'active'
  );
end;
$$;


--
-- Name: user_is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_is_admin(p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return user_has_persona(p_user_id, 'admin'::persona_name);
end;
$$;


--
-- Name: user_is_mentor_for_student(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_is_mentor_for_student(p_user_id uuid, p_student_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return user_has_persona(
    p_user_id,
    'mentor'::persona_name,
    'student'::persona_scope_type,
    p_student_id
  );
end;
$$;


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid,
    title text NOT NULL,
    message text NOT NULL,
    author_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    publish_at timestamp with time zone,
    expires_at timestamp with time zone
);


--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    due_date timestamp with time zone NOT NULL,
    attachment_drive_link text,
    created_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    topic text,
    max_marks numeric(6,2),
    enforce_deadline boolean DEFAULT false NOT NULL,
    CONSTRAINT assignments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id uuid,
    resource_id uuid,
    announcement_id uuid,
    uploaded_by uuid NOT NULL,
    original_filename text NOT NULL,
    mime_type text NOT NULL,
    file_size bigint NOT NULL,
    checksum_sha256 text,
    storage_provider text DEFAULT 'google_drive'::text NOT NULL,
    drive_file_id text,
    drive_folder_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT attachments_active_has_file CHECK (((status <> 'active'::text) OR (drive_file_id IS NOT NULL))),
    CONSTRAINT attachments_one_owner CHECK ((((((submission_id IS NOT NULL))::integer + ((resource_id IS NOT NULL))::integer) + ((announcement_id IS NOT NULL))::integer) = 1)),
    CONSTRAINT attachments_provider_check CHECK ((storage_provider = 'google_drive'::text)),
    CONSTRAINT attachments_size_check CHECK (((file_size > 0) AND (file_size <= 26214400))),
    CONSTRAINT attachments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'failed'::text, 'deleted'::text])))
);


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    student_id uuid NOT NULL,
    session_date date NOT NULL,
    status text NOT NULL,
    marked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    join_at timestamp with time zone,
    leave_at timestamp with time zone,
    CONSTRAINT attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text])))
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    event_date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    class_id uuid,
    kind public.calendar_event_kind DEFAULT 'event'::public.calendar_event_kind NOT NULL,
    slot_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: capability_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capability_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    capability text NOT NULL,
    effect text NOT NULL,
    scope_type public.persona_scope_type DEFAULT 'global'::public.persona_scope_type NOT NULL,
    scope_id uuid,
    reason text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT capability_overrides_effect_check CHECK ((effect = ANY (ARRAY['allow'::text, 'deny'::text]))),
    CONSTRAINT capability_overrides_scope_consistency CHECK ((((scope_type = 'global'::public.persona_scope_type) AND (scope_id IS NULL)) OR ((scope_type <> 'global'::public.persona_scope_type) AND (scope_id IS NOT NULL)))),
    CONSTRAINT capability_overrides_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: TABLE capability_overrides; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.capability_overrides IS 'Admin-managed per-profile capability exceptions layered over the persona baseline.
Precedence: hard rule > explicit deny > explicit allow > persona default. Only
active, global rows are consumed by resolution today; scoped rows are reserved.';


--
-- Name: class_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    session_date date NOT NULL,
    scheduled_start timestamp with time zone,
    scheduled_end timestamp with time zone,
    actual_start timestamp with time zone,
    actual_end timestamp with time zone,
    tutor_id uuid,
    tutor_join_at timestamp with time zone,
    tutor_leave_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    summary text,
    student_feedback text
);


--
-- Name: class_tutors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_tutors (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT class_teachers_id_not_null NOT NULL,
    tutor_id uuid CONSTRAINT class_teachers_teacher_id_not_null NOT NULL,
    class_id uuid CONSTRAINT class_teachers_class_id_not_null NOT NULL,
    active boolean DEFAULT true CONSTRAINT class_teachers_active_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT class_teachers_created_at_not_null NOT NULL
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comments_entity_type_check CHECK ((entity_type = ANY (ARRAY['submission'::text, 'resource'::text, 'meet'::text, 'announcement'::text])))
);


--
-- Name: conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    last_read_at timestamp with time zone,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind public.conversation_kind NOT NULL,
    title text,
    created_by uuid,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_message_body text,
    last_message_sender_id uuid,
    direct_key text
);


--
-- Name: TABLE conversations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.conversations IS 'Messaging: a direct (1:1) or group conversation. Separate from comments (which are contextual discussion on a submission/resource/meet).';


--
-- Name: document_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_counters (
    doc_type text NOT NULL,
    year integer NOT NULL,
    last_number integer DEFAULT 0 NOT NULL
);


--
-- Name: enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    class_id uuid NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_tags (
    tag_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    currency text NOT NULL,
    base_currency text NOT NULL,
    rate numeric(18,8) NOT NULL,
    effective_from date NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exchange_rates_rate_check CHECK ((rate > (0)::numeric))
);


--
-- Name: meet_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meet_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid,
    title text NOT NULL,
    url text NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_at timestamp with time zone
);


--
-- Name: mentorships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentorships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mentor_id uuid CONSTRAINT mentorships_teacher_id_not_null NOT NULL,
    student_id uuid NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.messages IS 'Messaging: an immutable message in a conversation. body is plaintext in v1 (server-readable for moderation); structured to allow per-conversation E2EE later without a redesign.';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: org_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_settings (
    id boolean DEFAULT true NOT NULL,
    institute_name text DEFAULT 'Cert-Ed Academia'::text NOT NULL,
    contact_email text,
    contact_phone text,
    bank_account text,
    bank_ifsc text,
    bank_branch text,
    terms_text text,
    signatory_name text,
    signatory_title text,
    signature_mode text DEFAULT 'text'::text NOT NULL,
    signature_text text DEFAULT 'Digitally signed'::text,
    default_currency text DEFAULT 'INR'::text NOT NULL,
    timezone text DEFAULT 'Asia/Kolkata'::text NOT NULL,
    receipt_prefix text DEFAULT 'CEA-R'::text NOT NULL,
    payslip_prefix text DEFAULT 'CEA-P'::text NOT NULL,
    messaging_matrix jsonb DEFAULT '{}'::jsonb NOT NULL,
    base_currency text DEFAULT 'INR'::text NOT NULL,
    CONSTRAINT org_settings_single_row CHECK (id)
);


--
-- Name: payslip_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payslip_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payslip_id uuid NOT NULL,
    label text NOT NULL,
    hours numeric(8,2) NOT NULL,
    rate numeric(16,3) NOT NULL,
    amount numeric(16,3) NOT NULL
);


--
-- Name: pending_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    to_email text NOT NULL,
    subject text NOT NULL,
    html text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT pending_emails_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])))
);


--
-- Name: persona_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persona_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    persona_name public.persona_name NOT NULL,
    scope_type public.persona_scope_type DEFAULT 'global'::public.persona_scope_type NOT NULL,
    scope_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scope_consistency CHECK ((((scope_type = 'global'::public.persona_scope_type) AND (scope_id IS NULL)) OR ((scope_type <> 'global'::public.persona_scope_type) AND (scope_id IS NOT NULL))))
);


--
-- Name: TABLE persona_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.persona_assignments IS 'Authorization model: personas (global + scoped) per profile. Global personas are
kept in sync with profiles.role (the account''s fixed identity); scoped personas
(e.g. mentor-for-a-student) come from their own tables such as mentorships.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    email text NOT NULL,
    full_name text,
    role public.user_role DEFAULT 'student'::public.user_role NOT NULL,
    status public.user_status DEFAULT 'pending'::public.user_status NOT NULL,
    class_level text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    setup_code_hash text,
    setup_code_expires_at timestamp with time zone
);


--
-- Name: rate_limit_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_counters (
    bucket_key text NOT NULL,
    window_started_at timestamp with time zone DEFAULT now() NOT NULL,
    hits integer DEFAULT 0 NOT NULL
);


--
-- Name: receipt_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipt_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receipt_id uuid NOT NULL,
    subject text NOT NULL,
    hours numeric(8,2) NOT NULL,
    rate numeric(16,3) NOT NULL,
    amount numeric(16,3) NOT NULL
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    remind_at timestamp with time zone NOT NULL,
    is_sent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resource_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_id uuid NOT NULL,
    version_no integer NOT NULL,
    title text NOT NULL,
    drive_link text,
    description text,
    category public.document_category DEFAULT 'general_documents'::public.document_category NOT NULL,
    subject text,
    file_type text,
    created_by uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    title text NOT NULL,
    drive_link text,
    uploaded_by uuid,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    topic text,
    category public.document_category DEFAULT 'general_documents'::public.document_category NOT NULL,
    description text,
    subject text,
    file_type text,
    download_count integer DEFAULT 0 NOT NULL,
    visibility public.document_visibility DEFAULT 'class'::public.document_visibility NOT NULL,
    CONSTRAINT resources_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: timetable_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timetable_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    subject text NOT NULL,
    tutor_id uuid,
    day_of_week smallint NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    mode_or_location text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    timezone text,
    CONSTRAINT timetable_slots_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
    CONSTRAINT timetable_slots_time_order CHECK ((end_time > start_time))
);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_drive_file_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_drive_file_id_key UNIQUE (drive_file_id);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_class_id_student_id_session_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_class_id_student_id_session_date_key UNIQUE (class_id, student_id, session_date);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: capability_overrides capability_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_overrides
    ADD CONSTRAINT capability_overrides_pkey PRIMARY KEY (id);


--
-- Name: class_sessions class_sessions_class_id_session_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_class_id_session_date_key UNIQUE (class_id, session_date);


--
-- Name: class_sessions class_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_pkey PRIMARY KEY (id);


--
-- Name: class_tutors class_teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_tutors
    ADD CONSTRAINT class_teachers_pkey PRIMARY KEY (id);


--
-- Name: class_tutors class_teachers_teacher_id_class_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_tutors
    ADD CONSTRAINT class_teachers_teacher_id_class_id_key UNIQUE (tutor_id, class_id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: conversation_participants conversation_participants_conversation_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_profile_id_key UNIQUE (conversation_id, profile_id);


--
-- Name: conversation_participants conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: document_counters document_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_counters
    ADD CONSTRAINT document_counters_pkey PRIMARY KEY (doc_type, year);


--
-- Name: enrollments enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);


--
-- Name: enrollments enrollments_student_id_class_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_student_id_class_id_key UNIQUE (student_id, class_id);


--
-- Name: entity_tags entity_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_pkey PRIMARY KEY (tag_id, entity_type, entity_id);


--
-- Name: exchange_rates exchange_rates_currency_base_currency_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_currency_base_currency_effective_from_key UNIQUE (currency, base_currency, effective_from);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: meet_links meet_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meet_links
    ADD CONSTRAINT meet_links_pkey PRIMARY KEY (id);


--
-- Name: mentorships mentorships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentorships
    ADD CONSTRAINT mentorships_pkey PRIMARY KEY (id);


--
-- Name: mentorships mentorships_teacher_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentorships
    ADD CONSTRAINT mentorships_teacher_id_student_id_key UNIQUE (mentor_id, student_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: org_settings org_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_settings
    ADD CONSTRAINT org_settings_pkey PRIMARY KEY (id);


--
-- Name: payslip_lines payslip_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslip_lines
    ADD CONSTRAINT payslip_lines_pkey PRIMARY KEY (id);


--
-- Name: payslips payslips_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_number_key UNIQUE (number);


--
-- Name: payslips payslips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_pkey PRIMARY KEY (id);


--
-- Name: pending_emails pending_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_emails
    ADD CONSTRAINT pending_emails_pkey PRIMARY KEY (id);


--
-- Name: persona_assignments persona_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persona_assignments
    ADD CONSTRAINT persona_assignments_pkey PRIMARY KEY (id);


--
-- Name: persona_assignments persona_assignments_profile_id_persona_name_scope_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persona_assignments
    ADD CONSTRAINT persona_assignments_profile_id_persona_name_scope_id_key UNIQUE (profile_id, persona_name, scope_id);


--
-- Name: profiles profiles_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_email_lowercase; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_email_lowercase CHECK ((email = lower(email))) NOT VALID;


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_counters rate_limit_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_counters
    ADD CONSTRAINT rate_limit_counters_pkey PRIMARY KEY (bucket_key);


--
-- Name: receipt_lines receipt_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_lines
    ADD CONSTRAINT receipt_lines_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_number_key UNIQUE (number);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: resource_versions resource_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_versions
    ADD CONSTRAINT resource_versions_pkey PRIMARY KEY (id);


--
-- Name: resource_versions resource_versions_resource_id_version_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_versions
    ADD CONSTRAINT resource_versions_resource_id_version_no_key UNIQUE (resource_id, version_no);


--
-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (id);


--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: timetable_slots timetable_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_slots
    ADD CONSTRAINT timetable_slots_pkey PRIMARY KEY (id);


--
-- Name: announcements_class_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX announcements_class_created_idx ON public.announcements USING btree (class_id, created_at DESC);


--
-- Name: assignments_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignments_class_idx ON public.assignments USING btree (class_id);


--
-- Name: assignments_status_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignments_status_due_idx ON public.assignments USING btree (status, due_date);


--
-- Name: attachments_announcement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_announcement_idx ON public.attachments USING btree (announcement_id, created_at DESC) WHERE ((announcement_id IS NOT NULL) AND (status = 'active'::text));


--
-- Name: attachments_reconcile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_reconcile_idx ON public.attachments USING btree (created_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));


--
-- Name: attachments_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_resource_idx ON public.attachments USING btree (resource_id, created_at DESC) WHERE ((resource_id IS NOT NULL) AND (status = 'active'::text));


--
-- Name: attachments_submission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_submission_idx ON public.attachments USING btree (submission_id, created_at DESC) WHERE ((submission_id IS NOT NULL) AND (status = 'active'::text));


--
-- Name: attendance_class_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_class_date_idx ON public.attendance USING btree (class_id, session_date);


--
-- Name: attendance_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_student_idx ON public.attendance USING btree (student_id, session_date DESC);


--
-- Name: audit_log_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_actor_idx ON public.audit_log USING btree (actor_id);


--
-- Name: audit_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_created_idx ON public.audit_log USING btree (created_at DESC);


--
-- Name: audit_log_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_entity_idx ON public.audit_log USING btree (entity_type, entity_id, created_at DESC);


--
-- Name: calendar_events_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_events_class_idx ON public.calendar_events USING btree (class_id);


--
-- Name: calendar_events_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_events_date_idx ON public.calendar_events USING btree (event_date);


--
-- Name: class_sessions_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_sessions_class_idx ON public.class_sessions USING btree (class_id, session_date DESC);


--
-- Name: class_tutors_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_tutors_class_idx ON public.class_tutors USING btree (class_id, active);


--
-- Name: class_tutors_tutor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_tutors_tutor_idx ON public.class_tutors USING btree (tutor_id, active);


--
-- Name: comments_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_entity_idx ON public.comments USING btree (entity_type, entity_id, created_at);


--
-- Name: conversations_direct_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conversations_direct_key_uniq ON public.conversations USING btree (direct_key) WHERE ((kind = 'direct'::public.conversation_kind) AND (direct_key IS NOT NULL));


--
-- Name: enrollments_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrollments_class_idx ON public.enrollments USING btree (class_id, active);


--
-- Name: enrollments_one_active_student_per_class; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX enrollments_one_active_student_per_class ON public.enrollments USING btree (class_id) WHERE active;


--
-- Name: enrollments_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrollments_student_idx ON public.enrollments USING btree (student_id, active);


--
-- Name: entity_tags_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_tags_entity_idx ON public.entity_tags USING btree (entity_type, entity_id);


--
-- Name: entity_tags_tag_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_tags_tag_idx ON public.entity_tags USING btree (tag_id);


--
-- Name: exchange_rates_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_rates_lookup_idx ON public.exchange_rates USING btree (base_currency, currency, effective_from DESC);


--
-- Name: idx_capability_overrides_resolve; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capability_overrides_resolve ON public.capability_overrides USING btree (profile_id) WHERE ((status = 'active'::text) AND (scope_type = 'global'::public.persona_scope_type));


--
-- Name: idx_conversation_participants_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_participants_conversation ON public.conversation_participants USING btree (conversation_id);


--
-- Name: idx_conversation_participants_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_participants_profile ON public.conversation_participants USING btree (profile_id);


--
-- Name: idx_conversations_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_last_message ON public.conversations USING btree (last_message_at DESC);


--
-- Name: idx_messages_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation_created ON public.messages USING btree (conversation_id, created_at);


--
-- Name: idx_persona_assignments_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persona_assignments_active ON public.persona_assignments USING btree (profile_id, persona_name) WHERE (status = 'active'::text);


--
-- Name: idx_persona_assignments_persona_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persona_assignments_persona_name ON public.persona_assignments USING btree (persona_name);


--
-- Name: idx_persona_assignments_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persona_assignments_profile_id ON public.persona_assignments USING btree (profile_id);


--
-- Name: idx_persona_assignments_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persona_assignments_scope ON public.persona_assignments USING btree (scope_type, scope_id) WHERE (scope_id IS NOT NULL);


--
-- Name: idx_persona_assignments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persona_assignments_status ON public.persona_assignments USING btree (status);


--
-- Name: meet_links_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meet_links_class_idx ON public.meet_links USING btree (class_id);


--
-- Name: mentorships_mentor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mentorships_mentor_idx ON public.mentorships USING btree (mentor_id, active);


--
-- Name: mentorships_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mentorships_student_idx ON public.mentorships USING btree (student_id, active);


--
-- Name: notifications_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_profile_idx ON public.notifications USING btree (profile_id, created_at DESC);


--
-- Name: notifications_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_unread_idx ON public.notifications USING btree (profile_id) WHERE (read_at IS NULL);


--
-- Name: payslip_lines_payslip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payslip_lines_payslip_idx ON public.payslip_lines USING btree (payslip_id);


--
-- Name: payslips_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payslips_created_idx ON public.payslips USING btree (created_at DESC);


--
-- Name: payslips_tutor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payslips_tutor_idx ON public.payslips USING btree (tutor_id);


--
-- Name: pending_emails_drain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_emails_drain_idx ON public.pending_emails USING btree (created_at) WHERE (status = 'pending'::text);


--
-- Name: persona_assignments_global_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX persona_assignments_global_unique ON public.persona_assignments USING btree (profile_id, persona_name) WHERE (scope_type = 'global'::public.persona_scope_type);


--
-- Name: profiles_role_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_role_status_idx ON public.profiles USING btree (role, status);


--
-- Name: receipt_lines_receipt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receipt_lines_receipt_idx ON public.receipt_lines USING btree (receipt_id);


--
-- Name: receipts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receipts_created_idx ON public.receipts USING btree (created_at DESC);


--
-- Name: receipts_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receipts_student_idx ON public.receipts USING btree (student_id);


--
-- Name: reminders_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_user_idx ON public.reminders USING btree (user_id);


--
-- Name: resource_versions_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resource_versions_resource_idx ON public.resource_versions USING btree (resource_id, version_no DESC);


--
-- Name: resources_class_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_class_category_idx ON public.resources USING btree (class_id, category, status);


--
-- Name: resources_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_class_idx ON public.resources USING btree (class_id);


--
-- Name: resources_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_subject_idx ON public.resources USING btree (subject) WHERE (subject IS NOT NULL);


--
-- Name: submissions_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX submissions_one_active ON public.submissions USING btree (assignment_id, student_id) WHERE is_active;


--
-- Name: submissions_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX submissions_student_idx ON public.submissions USING btree (student_id, is_active);


--
-- Name: tags_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tags_name_unique ON public.tags USING btree (lower(name));


--
-- Name: timetable_slots_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timetable_slots_active_idx ON public.timetable_slots USING btree (active);


--
-- Name: timetable_slots_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timetable_slots_class_idx ON public.timetable_slots USING btree (class_id);


--
-- Name: uq_capability_overrides_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_capability_overrides_identity ON public.capability_overrides USING btree (profile_id, capability, effect, scope_type, COALESCE((scope_id)::text, 'global'::text));


--
-- Name: attachments trg_attachments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_attachments_updated_at BEFORE UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: capability_overrides trg_capability_overrides_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_capability_overrides_updated_at BEFORE UPDATE ON public.capability_overrides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: assignments trg_reclassify_on_due_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reclassify_on_due_change AFTER UPDATE OF due_date ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.reclassify_submissions_on_due_change();


--
-- Name: submissions trg_submission_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_submission_status BEFORE INSERT ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.set_submission_status();


--
-- Name: announcements announcements_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: announcements announcements_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: assignments assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: assignments assignments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: attachments attachments_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: attendance attendance_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: attendance attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: calendar_events calendar_events_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: calendar_events calendar_events_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.timetable_slots(id) ON DELETE SET NULL;


--
-- Name: capability_overrides capability_overrides_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_overrides
    ADD CONSTRAINT capability_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: capability_overrides capability_overrides_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capability_overrides
    ADD CONSTRAINT capability_overrides_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: class_sessions class_sessions_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_sessions class_sessions_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: class_tutors class_teachers_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_tutors
    ADD CONSTRAINT class_teachers_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_tutors class_teachers_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_tutors
    ADD CONSTRAINT class_teachers_teacher_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: comments comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_last_message_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_last_message_sender_id_fkey FOREIGN KEY (last_message_sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: enrollments enrollments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: enrollments enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: entity_tags entity_tags_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: entity_tags entity_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: exchange_rates exchange_rates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: meet_links meet_links_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meet_links
    ADD CONSTRAINT meet_links_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: meet_links meet_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meet_links
    ADD CONSTRAINT meet_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: mentorships mentorships_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentorships
    ADD CONSTRAINT mentorships_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: mentorships mentorships_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentorships
    ADD CONSTRAINT mentorships_teacher_id_fkey FOREIGN KEY (mentor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: payslip_lines payslip_lines_payslip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslip_lines
    ADD CONSTRAINT payslip_lines_payslip_id_fkey FOREIGN KEY (payslip_id) REFERENCES public.payslips(id) ON DELETE CASCADE;


--
-- Name: payslips payslips_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: payslips payslips_fx_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_fx_rate_id_fkey FOREIGN KEY (fx_rate_id) REFERENCES public.exchange_rates(id) ON DELETE SET NULL;


--
-- Name: payslips payslips_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_teacher_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: persona_assignments persona_assignments_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persona_assignments
    ADD CONSTRAINT persona_assignments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: receipt_lines receipt_lines_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_lines
    ADD CONSTRAINT receipt_lines_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE CASCADE;


--
-- Name: receipts receipts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: receipts receipts_fx_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_fx_rate_id_fkey FOREIGN KEY (fx_rate_id) REFERENCES public.exchange_rates(id) ON DELETE SET NULL;


--
-- Name: receipts receipts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: reminders reminders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: resource_versions resource_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_versions
    ADD CONSTRAINT resource_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: resource_versions resource_versions_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_versions
    ADD CONSTRAINT resource_versions_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;


--
-- Name: resources resources_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: resources resources_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: submissions submissions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;


--
-- Name: submissions submissions_graded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: submissions submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tags tags_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: timetable_slots timetable_slots_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_slots
    ADD CONSTRAINT timetable_slots_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: timetable_slots timetable_slots_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_slots
    ADD CONSTRAINT timetable_slots_teacher_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.profiles(id);


--
-- Name: capability_overrides Admins can read all capability overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all capability overrides" ON public.capability_overrides FOR SELECT USING (public.user_is_admin(( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.auth_user_id = auth.uid()))));


--
-- Name: persona_assignments Admins can read all persona assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all persona assignments" ON public.persona_assignments FOR SELECT USING (public.user_is_admin(( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.auth_user_id = auth.uid()))));


--
-- Name: capability_overrides Only admins can delete capability overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete capability overrides" ON public.capability_overrides FOR DELETE USING (public.user_is_admin(( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.auth_user_id = auth.uid()))));


--
-- Name: persona_assignments Only admins can delete persona assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete persona assignments" ON public.persona_assignments FOR DELETE USING (public.user_is_admin(( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.auth_user_id = auth.uid()))));


--
-- Name: capability_overrides Only admins can insert capability overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can insert capability overrides" ON public.capability_overrides FOR INSERT WITH CHECK (public.user_is_admin(( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.auth_user_id = auth.uid()))));


--
-- Name: persona_assignments Only admins can insert persona assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can insert persona assignments" ON public.persona_assignments FOR INSERT WITH CHECK (public.user_is_admin(( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.auth_user_id = auth.uid()))));


--
-- Name: capability_overrides Only admins can update capability overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can update capability overrides" ON public.capability_overrides FOR UPDATE USING (public.user_is_admin(( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.auth_user_id = auth.uid()))));


--
-- Name: persona_assignments Only admins can update persona assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can update persona assignments" ON public.persona_assignments FOR UPDATE USING (public.user_is_admin(( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.auth_user_id = auth.uid()))));


--
-- Name: capability_overrides Users can read own capability overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own capability overrides" ON public.capability_overrides FOR SELECT USING (public.is_self_active(profile_id));


--
-- Name: persona_assignments Users can read own persona assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own persona assignments" ON public.persona_assignments FOR SELECT USING (public.is_self_active(profile_id));


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements announcements_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_insert ON public.announcements FOR INSERT WITH CHECK ((public.is_active_admin() OR ((class_id IS NOT NULL) AND public.teaches_class(class_id))));


--
-- Name: announcements announcements_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_read ON public.announcements FOR SELECT USING ((public.is_active_admin() OR public.teaches_class(class_id) OR ((status = 'active'::text) AND ((publish_at IS NULL) OR (publish_at <= now())) AND ((expires_at IS NULL) OR (expires_at > now())) AND (((class_id IS NULL) AND (public.current_status() = 'active'::public.user_status)) OR public.is_enrolled(class_id)))));


--
-- Name: announcements announcements_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_update ON public.announcements FOR UPDATE USING ((public.is_active_admin() OR ((class_id IS NOT NULL) AND public.teaches_class(class_id)))) WITH CHECK ((public.is_active_admin() OR ((class_id IS NOT NULL) AND public.teaches_class(class_id))));


--
-- Name: assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: assignments assignments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignments_insert ON public.assignments FOR INSERT WITH CHECK ((public.is_active_admin() OR public.teaches_class(class_id)));


--
-- Name: assignments assignments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignments_read ON public.assignments FOR SELECT USING ((public.is_active_admin() OR (public.is_enrolled(class_id) AND (status = 'active'::text)) OR public.teaches_class(class_id)));


--
-- Name: assignments assignments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignments_update ON public.assignments FOR UPDATE USING ((public.is_active_admin() OR public.teaches_class(class_id))) WITH CHECK ((public.is_active_admin() OR public.teaches_class(class_id)));


--
-- Name: attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: attachments attachments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attachments_read ON public.attachments FOR SELECT USING (((status = 'active'::text) AND ((EXISTS ( SELECT 1
   FROM public.submissions s
  WHERE ((s.id = attachments.submission_id) AND (public.is_active_admin() OR (EXISTS ( SELECT 1
           FROM public.assignments a
          WHERE ((a.id = s.assignment_id) AND public.teaches_class(a.class_id)))) OR public.is_self_active(s.student_id) OR public.mentors_student(s.student_id))))) OR (EXISTS ( SELECT 1
   FROM public.resources r
  WHERE ((r.id = attachments.resource_id) AND (public.is_active_admin() OR public.teaches_class(r.class_id) OR (public.is_enrolled(r.class_id) AND (r.status = 'active'::text) AND (r.visibility = 'class'::public.document_visibility)))))) OR (EXISTS ( SELECT 1
   FROM public.announcements an
  WHERE ((an.id = attachments.announcement_id) AND (public.is_active_admin() OR public.teaches_class(an.class_id) OR ((an.status = 'active'::text) AND ((an.publish_at IS NULL) OR (an.publish_at <= now())) AND ((an.expires_at IS NULL) OR (an.expires_at > now())) AND (((an.class_id IS NULL) AND (public.current_status() = 'active'::public.user_status)) OR public.is_enrolled(an.class_id))))))))));


--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance attendance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_read ON public.attendance FOR SELECT USING ((public.is_active_admin() OR public.teaches_class(class_id) OR public.is_self_active(student_id) OR public.mentors_student(student_id)));


--
-- Name: attendance attendance_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_write ON public.attendance USING ((public.is_active_admin() OR public.teaches_class(class_id))) WITH CHECK (((public.is_active_admin() OR public.teaches_class(class_id)) AND (EXISTS ( SELECT 1
   FROM public.enrollments e
  WHERE ((e.class_id = attendance.class_id) AND (e.student_id = attendance.student_id) AND e.active)))));


--
-- Name: audit_log audit_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_admin_insert ON public.audit_log FOR INSERT WITH CHECK (public.is_active_admin());


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_read ON public.audit_log FOR SELECT USING (public.is_active_admin());


--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_events calendar_events_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_events_read ON public.calendar_events FOR SELECT USING ((public.is_active_admin() OR ((class_id IS NULL) AND (public.current_status() = 'active'::public.user_status)) OR public.teaches_class(class_id) OR public.is_enrolled(class_id)));


--
-- Name: calendar_events calendar_events_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_events_write ON public.calendar_events USING ((public.is_active_admin() OR ((class_id IS NOT NULL) AND public.teaches_class(class_id)))) WITH CHECK ((public.is_active_admin() OR ((class_id IS NOT NULL) AND public.teaches_class(class_id))));


--
-- Name: capability_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.capability_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: class_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: class_sessions class_sessions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_sessions_read ON public.class_sessions FOR SELECT USING ((public.is_active_admin() OR public.teaches_class(class_id) OR public.is_enrolled(class_id)));


--
-- Name: class_sessions class_sessions_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_sessions_write ON public.class_sessions USING ((public.is_active_admin() OR public.teaches_class(class_id))) WITH CHECK ((public.is_active_admin() OR public.teaches_class(class_id)));


--
-- Name: class_tutors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_tutors ENABLE ROW LEVEL SECURITY;

--
-- Name: class_tutors class_tutors_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_tutors_admin_write ON public.class_tutors USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());


--
-- Name: class_tutors class_tutors_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_tutors_read ON public.class_tutors FOR SELECT USING ((public.is_active_admin() OR public.is_self_active(tutor_id)));


--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

--
-- Name: classes classes_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_admin_write ON public.classes USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());


--
-- Name: classes classes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_read ON public.classes FOR SELECT USING ((public.is_active_admin() OR public.teaches_class(id) OR public.is_enrolled(id)));


--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: comments comments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comments_delete ON public.comments FOR DELETE USING ((public.is_active_admin() OR public.is_self_active(author_id)));


--
-- Name: comments comments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comments_insert ON public.comments FOR INSERT WITH CHECK ((public.is_active_admin() OR ((author_id = ( SELECT p.id
   FROM public.profiles p
  WHERE (p.auth_user_id = auth.uid()))) AND (((entity_type = 'submission'::text) AND (EXISTS ( SELECT 1
   FROM public.submissions s
  WHERE ((s.id = comments.entity_id) AND ((s.student_id = ( SELECT p.id
           FROM public.profiles p
          WHERE (p.auth_user_id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM public.assignments a
          WHERE ((a.id = s.assignment_id) AND public.teaches_class(a.class_id)))) OR public.mentors_student(s.student_id)))))) OR ((entity_type = 'resource'::text) AND (EXISTS ( SELECT 1
   FROM public.resources r
  WHERE ((r.id = comments.entity_id) AND (public.teaches_class(r.class_id) OR (public.is_enrolled(r.class_id) AND (r.status = 'active'::text))))))) OR ((entity_type = 'meet'::text) AND (EXISTS ( SELECT 1
   FROM public.meet_links m
  WHERE ((m.id = comments.entity_id) AND ((m.class_id IS NULL) OR public.teaches_class(m.class_id) OR public.is_enrolled(m.class_id)))))) OR ((entity_type = 'announcement'::text) AND (EXISTS ( SELECT 1
   FROM public.announcements an
  WHERE ((an.id = comments.entity_id) AND (((an.class_id IS NULL) AND (public.current_status() = 'active'::public.user_status) AND (an.status = 'active'::text)) OR (public.is_enrolled(an.class_id) AND (an.status = 'active'::text)) OR public.teaches_class(an.class_id))))))))));


--
-- Name: comments comments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comments_read ON public.comments FOR SELECT USING ((public.is_active_admin() OR ((entity_type = 'submission'::text) AND (EXISTS ( SELECT 1
   FROM public.submissions s
  WHERE ((s.id = comments.entity_id) AND ((s.student_id = ( SELECT p.id
           FROM public.profiles p
          WHERE (p.auth_user_id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM public.assignments a
          WHERE ((a.id = s.assignment_id) AND public.teaches_class(a.class_id)))) OR public.mentors_student(s.student_id)))))) OR ((entity_type = 'resource'::text) AND (EXISTS ( SELECT 1
   FROM public.resources r
  WHERE ((r.id = comments.entity_id) AND (public.teaches_class(r.class_id) OR (public.is_enrolled(r.class_id) AND (r.status = 'active'::text))))))) OR ((entity_type = 'meet'::text) AND (EXISTS ( SELECT 1
   FROM public.meet_links m
  WHERE ((m.id = comments.entity_id) AND ((m.class_id IS NULL) OR public.teaches_class(m.class_id) OR public.is_enrolled(m.class_id)))))) OR ((entity_type = 'announcement'::text) AND (EXISTS ( SELECT 1
   FROM public.announcements an
  WHERE ((an.id = comments.entity_id) AND (((an.class_id IS NULL) AND (public.current_status() = 'active'::public.user_status) AND (an.status = 'active'::text)) OR (public.is_enrolled(an.class_id) AND (an.status = 'active'::text)) OR public.teaches_class(an.class_id))))))));


--
-- Name: conversation_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_participants conversation_participants_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_participants_read ON public.conversation_participants FOR SELECT USING ((public.is_conversation_member(conversation_id) OR public.is_active_admin()));


--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations conversations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversations_insert ON public.conversations FOR INSERT WITH CHECK ((created_by = public.current_profile_id()));


--
-- Name: conversations conversations_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversations_read ON public.conversations FOR SELECT USING ((public.is_conversation_member(id) OR public.is_active_admin()));


--
-- Name: document_counters counters_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY counters_admin ON public.document_counters USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());


--
-- Name: document_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollments enrollments_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY enrollments_admin_write ON public.enrollments USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());


--
-- Name: enrollments enrollments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY enrollments_read ON public.enrollments FOR SELECT USING ((public.is_active_admin() OR public.teaches_class(class_id) OR public.is_self_active(student_id)));


--
-- Name: entity_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rates exchange_rates_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rates_admin_all ON public.exchange_rates USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());


--
-- Name: meet_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meet_links ENABLE ROW LEVEL SECURITY;

--
-- Name: meet_links meet_links_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meet_links_read ON public.meet_links FOR SELECT USING ((public.is_active_admin() OR ((class_id IS NULL) AND (public.current_status() = 'active'::public.user_status)) OR public.teaches_class(class_id) OR public.is_enrolled(class_id)));


--
-- Name: meet_links meet_links_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meet_links_write ON public.meet_links USING ((public.is_active_admin() OR ((class_id IS NOT NULL) AND public.teaches_class(class_id)))) WITH CHECK ((public.is_active_admin() OR ((class_id IS NOT NULL) AND public.teaches_class(class_id))));


--
-- Name: mentorships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mentorships ENABLE ROW LEVEL SECURITY;

--
-- Name: mentorships mentorships_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mentorships_admin_write ON public.mentorships USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());


--
-- Name: mentorships mentorships_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mentorships_read ON public.mentorships FOR SELECT USING ((public.is_active_admin() OR public.is_self_active(mentor_id) OR public.is_self_active(student_id)));


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_insert ON public.messages FOR INSERT WITH CHECK (((sender_id = public.current_profile_id()) AND public.is_conversation_member(conversation_id)));


--
-- Name: messages messages_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_read ON public.messages FOR SELECT USING ((public.is_conversation_member(conversation_id) OR public.is_active_admin()));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_read ON public.notifications FOR SELECT USING (public.is_self_active(profile_id));


--
-- Name: notifications notifications_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update ON public.notifications FOR UPDATE USING (public.is_self_active(profile_id)) WITH CHECK (public.is_self_active(profile_id));


--
-- Name: org_settings org_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_admin_write ON public.org_settings USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());


--
-- Name: org_settings org_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_read ON public.org_settings FOR SELECT USING (public.is_active_admin());


--
-- Name: org_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: payslip_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payslip_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: payslip_lines payslip_lines_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payslip_lines_admin_write ON public.payslip_lines USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());


--
-- Name: payslip_lines payslip_lines_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payslip_lines_read ON public.payslip_lines FOR SELECT USING ((public.is_active_admin() OR (EXISTS ( SELECT 1
   FROM (public.payslips ps
     JOIN public.profiles p ON ((p.id = ps.tutor_id)))
  WHERE ((ps.id = payslip_lines.payslip_id) AND (p.auth_user_id = auth.uid()) AND (p.status = 'active'::public.user_status))))));


--
-- Name: payslips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

--
-- Name: payslips payslips_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payslips_admin_write ON public.payslips USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());


--
-- Name: payslips payslips_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payslips_read ON public.payslips FOR SELECT USING ((public.is_active_admin() OR public.is_self_active(tutor_id)));


--
-- Name: pending_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: persona_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.persona_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_admin_write ON public.profiles USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());


--
-- Name: profiles profiles_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_self_read ON public.profiles FOR SELECT USING (((auth_user_id = auth.uid()) OR public.is_active_admin()));


--
-- Name: profiles profiles_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE USING (((auth_user_id = auth.uid()) OR public.is_active_admin()));


--
-- Name: rate_limit_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: receipt_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.receipt_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: receipt_lines receipt_lines_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY receipt_lines_admin_write ON public.receipt_lines USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());


--
-- Name: receipt_lines receipt_lines_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY receipt_lines_read ON public.receipt_lines FOR SELECT USING ((public.is_active_admin() OR (EXISTS ( SELECT 1
   FROM (public.receipts r
     JOIN public.profiles p ON ((p.id = r.student_id)))
  WHERE ((r.id = receipt_lines.receipt_id) AND (p.auth_user_id = auth.uid()) AND (p.status = 'active'::public.user_status))))));


--
-- Name: receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: receipts receipts_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY receipts_admin_write ON public.receipts USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());


--
-- Name: receipts receipts_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY receipts_read ON public.receipts FOR SELECT USING ((public.is_active_admin() OR public.is_self_active(student_id)));


--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders reminders_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reminders_all ON public.reminders USING (public.is_self_active(user_id));


--
-- Name: resource_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_versions resource_versions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_versions_read ON public.resource_versions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.resources r
  WHERE ((r.id = resource_versions.resource_id) AND (public.is_active_admin() OR public.teaches_class(r.class_id) OR (public.is_enrolled(r.class_id) AND (r.status = 'active'::text) AND (r.visibility = 'class'::public.document_visibility)))))));


--
-- Name: resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

--
-- Name: resources resources_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resources_insert ON public.resources FOR INSERT WITH CHECK ((public.is_active_admin() OR public.teaches_class(class_id)));


--
-- Name: resources resources_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resources_read ON public.resources FOR SELECT USING ((public.is_active_admin() OR public.teaches_class(class_id) OR (public.is_enrolled(class_id) AND (status = 'active'::text) AND (visibility = 'class'::public.document_visibility))));


--
-- Name: resources resources_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resources_update ON public.resources FOR UPDATE USING ((public.is_active_admin() OR public.teaches_class(class_id))) WITH CHECK ((public.is_active_admin() OR public.teaches_class(class_id)));


--
-- Name: submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: submissions submissions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY submissions_insert ON public.submissions FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.assignments a
  WHERE ((a.id = submissions.assignment_id) AND (a.status = 'active'::text) AND public.is_enrolled(a.class_id)))) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = submissions.student_id) AND (p.auth_user_id = auth.uid()))))));


--
-- Name: submissions submissions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY submissions_read ON public.submissions FOR SELECT USING ((public.is_active_admin() OR (EXISTS ( SELECT 1
   FROM public.assignments a
  WHERE ((a.id = submissions.assignment_id) AND public.teaches_class(a.class_id)))) OR public.is_self_active(student_id) OR public.mentors_student(student_id)));


--
-- Name: submissions submissions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY submissions_update ON public.submissions FOR UPDATE USING ((public.is_active_admin() OR (public.is_self_active(student_id) AND (is_active = true) AND (score IS NULL) AND (graded_at IS NULL)))) WITH CHECK ((public.is_active_admin() OR public.is_self_active(student_id)));


--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_read ON public.tags FOR SELECT USING ((public.current_status() = 'active'::public.user_status));


--
-- Name: timetable_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: timetable_slots timetable_slots_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timetable_slots_read ON public.timetable_slots FOR SELECT USING ((public.is_active_admin() OR public.teaches_class(class_id) OR public.is_enrolled(class_id)));


--
-- Name: timetable_slots timetable_slots_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timetable_slots_write ON public.timetable_slots USING ((public.is_active_admin() OR public.teaches_class(class_id))) WITH CHECK ((public.is_active_admin() OR public.teaches_class(class_id)));


--
-- Name: FUNCTION current_app_role(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_app_role() TO authenticated;


--
-- Name: FUNCTION current_profile_id(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_profile_id() TO authenticated;


--
-- Name: FUNCTION current_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.current_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_status() TO authenticated;


--
-- Name: FUNCTION edit_assignment_and_reclassify(p_id uuid, p_title text, p_description text, p_due_date timestamp with time zone, p_attachment_drive_link text, p_topic text, p_max_marks numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.edit_assignment_and_reclassify(p_id uuid, p_title text, p_description text, p_due_date timestamp with time zone, p_attachment_drive_link text, p_topic text, p_max_marks numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.edit_assignment_and_reclassify(p_id uuid, p_title text, p_description text, p_due_date timestamp with time zone, p_attachment_drive_link text, p_topic text, p_max_marks numeric) TO service_role;


--
-- Name: FUNCTION finance_totals(p_kind text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finance_totals(p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_totals(p_kind text) TO authenticated;


--
-- Name: FUNCTION is_active_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_active_admin() TO authenticated;


--
-- Name: FUNCTION is_conversation_member(p_conversation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_conversation_member(p_conversation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_conversation_member(p_conversation_id uuid) TO authenticated;


--
-- Name: FUNCTION is_enrolled(p_class_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_enrolled(p_class_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_enrolled(p_class_id uuid) TO authenticated;


--
-- Name: FUNCTION is_self_active(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_self_active(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_self_active(p_id uuid) TO authenticated;


--
-- Name: FUNCTION issue_payslip_doc(p_party_id uuid, p_party_name text, p_class_level text, p_issue_date date, p_currency text, p_note text, p_subtotal numeric, p_discount numeric, p_total numeric, p_created_by uuid, p_prefix text, p_lines jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.issue_payslip_doc(p_party_id uuid, p_party_name text, p_class_level text, p_issue_date date, p_currency text, p_note text, p_subtotal numeric, p_discount numeric, p_total numeric, p_created_by uuid, p_prefix text, p_lines jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.issue_payslip_doc(p_party_id uuid, p_party_name text, p_class_level text, p_issue_date date, p_currency text, p_note text, p_subtotal numeric, p_discount numeric, p_total numeric, p_created_by uuid, p_prefix text, p_lines jsonb) TO service_role;


--
-- Name: FUNCTION issue_receipt_doc(p_party_id uuid, p_party_name text, p_class_level text, p_issue_date date, p_currency text, p_note text, p_subtotal numeric, p_discount numeric, p_total numeric, p_created_by uuid, p_prefix text, p_lines jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.issue_receipt_doc(p_party_id uuid, p_party_name text, p_class_level text, p_issue_date date, p_currency text, p_note text, p_subtotal numeric, p_discount numeric, p_total numeric, p_created_by uuid, p_prefix text, p_lines jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.issue_receipt_doc(p_party_id uuid, p_party_name text, p_class_level text, p_issue_date date, p_currency text, p_note text, p_subtotal numeric, p_discount numeric, p_total numeric, p_created_by uuid, p_prefix text, p_lines jsonb) TO service_role;


--
-- Name: FUNCTION mentors_class(p_class_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mentors_class(p_class_id uuid) TO authenticated;


--
-- Name: FUNCTION mentors_student(p_student_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mentors_student(p_student_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mentors_student(p_student_id uuid) TO authenticated;


--
-- Name: FUNCTION next_document_number(p_doc_type text, p_year integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.next_document_number(p_doc_type text, p_year integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.next_document_number(p_doc_type text, p_year integer) TO service_role;


--
-- Name: FUNCTION rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) TO service_role;


--
-- Name: FUNCTION reclassify_submissions_on_due_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reclassify_submissions_on_due_change() FROM PUBLIC;


--
-- Name: COLUMN submissions.assignment_id; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(assignment_id) ON TABLE public.submissions TO authenticated;


--
-- Name: COLUMN submissions.student_id; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(student_id) ON TABLE public.submissions TO authenticated;


--
-- Name: COLUMN submissions.drive_link; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(drive_link) ON TABLE public.submissions TO authenticated;


--
-- Name: COLUMN submissions.file_name; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(file_name) ON TABLE public.submissions TO authenticated;


--
-- Name: COLUMN submissions.status; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(status) ON TABLE public.submissions TO authenticated;


--
-- Name: COLUMN submissions.submitted_at; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(submitted_at) ON TABLE public.submissions TO authenticated;


--
-- Name: COLUMN submissions.is_active; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(is_active),UPDATE(is_active) ON TABLE public.submissions TO authenticated;


--
-- Name: FUNCTION replace_own_submission(p_assignment_id uuid, p_drive_link text, p_file_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.replace_own_submission(p_assignment_id uuid, p_drive_link text, p_file_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.replace_own_submission(p_assignment_id uuid, p_drive_link text, p_file_name text) TO authenticated;


--
-- Name: FUNCTION revoke_profile_guarded(p_target uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revoke_profile_guarded(p_target uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_profile_guarded(p_target uuid) TO service_role;


--
-- Name: FUNCTION set_submission_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_submission_status() FROM PUBLIC;


--
-- Name: FUNCTION teaches_class(p_class_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.teaches_class(p_class_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.teaches_class(p_class_id uuid) TO authenticated;


--
-- Name: FUNCTION user_has_persona(p_user_id uuid, p_persona public.persona_name, p_scope_type public.persona_scope_type, p_scope_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.user_has_persona(p_user_id uuid, p_persona public.persona_name, p_scope_type public.persona_scope_type, p_scope_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_has_persona(p_user_id uuid, p_persona public.persona_name, p_scope_type public.persona_scope_type, p_scope_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_has_persona(p_user_id uuid, p_persona public.persona_name, p_scope_type public.persona_scope_type, p_scope_id uuid) TO service_role;


--
-- Name: FUNCTION user_is_admin(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.user_is_admin(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_is_admin(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_is_admin(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION user_is_mentor_for_student(p_user_id uuid, p_student_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.user_is_mentor_for_student(p_user_id uuid, p_student_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_is_mentor_for_student(p_user_id uuid, p_student_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_is_mentor_for_student(p_user_id uuid, p_student_id uuid) TO service_role;


--
-- Name: COLUMN notifications.read_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(read_at) ON TABLE public.notifications TO authenticated;


--
-- Name: COLUMN profiles.full_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(full_name) ON TABLE public.profiles TO authenticated;


--
-- PostgreSQL database dump complete
--



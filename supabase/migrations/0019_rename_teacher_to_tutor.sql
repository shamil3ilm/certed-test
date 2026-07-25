-- Unify domain vocabulary on 'tutor' (the product term; the UI + persona model
-- already use it). Renames the role value, the class_teachers table, and every
-- teacher_* column, then recreates the SQL functions whose bodies referenced the
-- old names (a rename does not rewrite function source). RLS policy expressions
-- follow column renames automatically; policy/index NAMES are renamed for parity.

-- 1. Role identity value.
alter type user_role rename value 'teacher' to 'tutor';

-- 2. Table + columns.
alter table class_teachers rename to class_tutors;
alter table class_tutors rename column teacher_id to tutor_id;
alter table mentorships rename column teacher_id to tutor_id;
alter table timetable_slots rename column teacher_id to tutor_id;
alter table payslips rename column teacher_id to tutor_id;
alter table payslips rename column teacher_name_snapshot to tutor_name_snapshot;

-- 3. Index names (definitions already follow the rename; names updated for parity).
alter index class_teachers_class_idx rename to class_tutors_class_idx;
alter index class_teachers_teacher_idx rename to class_tutors_tutor_idx;
alter index mentorships_teacher_idx rename to mentorships_tutor_idx;
alter index payslips_teacher_idx rename to payslips_tutor_idx;

-- 4. Policy names on the renamed table.
alter policy class_teachers_read on class_tutors rename to class_tutors_read;
alter policy class_teachers_admin_write on class_tutors rename to class_tutors_admin_write;

-- 5. Recreate functions whose stored source referenced the old table/column names.
create or replace function teaches_class(p_class_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from class_tutors ct
    join profiles p on p.id = ct.tutor_id
    where p.auth_user_id = auth.uid() and p.status = 'active'
      and ct.class_id = p_class_id and ct.active
  )
$$;

create or replace function mentors_student(p_student_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from mentorships m
    join profiles p on p.id = m.tutor_id
    where p.auth_user_id = auth.uid() and p.status = 'active'
      and m.student_id = p_student_id and m.active
  )
$$;

create or replace function issue_payslip_doc(
  p_party_id uuid,
  p_party_name text,
  p_class_level text,
  p_issue_date date,
  p_currency text,
  p_note text,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_created_by uuid,
  p_prefix text,
  p_lines jsonb
) returns payslips
language plpgsql
security definer
set search_path = public
as $$
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

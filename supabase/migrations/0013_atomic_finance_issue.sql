-- 0013: make finance issuance atomic. The old issuance path allocated a number,
-- inserted the header row, and then inserted line rows as separate application
-- steps, which risked gaps or half-written documents if a later step failed.

create or replace function issue_receipt_doc(
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
) returns receipts
language plpgsql
security definer
set search_path = public
as $$
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
    teacher_id,
    teacher_name_snapshot,
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

revoke execute on function issue_receipt_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb) from public;
revoke execute on function issue_payslip_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb) from public;
grant execute on function issue_receipt_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb) to service_role;
grant execute on function issue_payslip_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb) to service_role;

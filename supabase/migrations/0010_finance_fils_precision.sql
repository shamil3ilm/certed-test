-- 0010: widen finance money columns from numeric(12,2) to numeric(16,3).
-- The currency picker offers 3-decimal (fils) currencies — KWD, BHD, OMR — but the
-- amount columns only held 2 decimals, so fils were silently truncated on an issued
-- financial document. 3 fractional digits + 13 integer digits (max ~1e13) covers the
-- validator's ceiling (1000h × 1,000,000/h × 50 lines = 5e10). Widening only —
-- existing 2-decimal values convert cleanly; safe to re-run.
alter table receipts
  alter column subtotal type numeric(16,3),
  alter column discount type numeric(16,3),
  alter column total    type numeric(16,3);

alter table receipt_lines
  alter column rate   type numeric(16,3),
  alter column amount type numeric(16,3);

alter table payslips
  alter column subtotal type numeric(16,3),
  alter column discount type numeric(16,3),
  alter column total    type numeric(16,3);

alter table payslip_lines
  alter column rate   type numeric(16,3),
  alter column amount type numeric(16,3);

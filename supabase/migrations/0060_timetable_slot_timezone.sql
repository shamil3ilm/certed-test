-- 0060: per-slot timezone for recurring timetable slots. Depends on 0004 (timetable_slots)
-- and 0001 (org_settings).
--
-- A recurring weekly slot is now anchored to its OWN zone (the tutor's, stamped at
-- creation) instead of assuming the single institute zone. Storing the slot in the zone
-- it was entered in keeps it a valid same-day interval there, so a late class never
-- straddles a foreign midnight, and expandSlots resolves each occurrence's absolute
-- instant in that zone (DST-correct). NULL means "fall back to the institute anchor zone
-- (org_settings.timezone)" - the meaning legacy rows already carried.
--
-- The existing timetable_slots_time_order CHECK (end_time > start_time) is intentionally
-- KEPT: because each slot lives in its own zone, its wall-clock interval is always
-- same-day valid, so no straddle relaxation is ever needed.

alter table timetable_slots
  add column if not exists timezone text;

comment on column timetable_slots.timezone is
  'IANA zone the slot''s day_of_week/start_time/end_time wall-clock is anchored to (the creator''s zone). NULL = fall back to org_settings.timezone.';

-- Backfill existing rows to the current institute zone so their meaning is unchanged and
-- explicit (existing slots were authored as institute wall-clock).
update timetable_slots
  set timezone = (select timezone from org_settings limit 1)
  where timezone is null;

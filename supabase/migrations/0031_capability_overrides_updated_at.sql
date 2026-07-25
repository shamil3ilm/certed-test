-- 0031: keep capability_overrides.updated_at honest.
--
-- 0020 declared updated_at NOT NULL DEFAULT now(), but the data layer only ever
-- inserts/deletes overrides (setCapabilityOverride is delete-then-insert), so the
-- column can never change after insert despite its name. Attach a BEFORE UPDATE
-- trigger so it self-maintains if an update path is ever added. Purely additive:
-- with no update path today the trigger simply never fires.
create or replace function set_updated_at() returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_capability_overrides_updated_at on capability_overrides;
create trigger trg_capability_overrides_updated_at
  before update on capability_overrides
  for each row execute function set_updated_at();

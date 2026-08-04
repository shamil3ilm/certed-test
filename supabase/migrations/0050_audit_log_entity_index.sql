-- Entity history index for audit_log.
--
-- "Everything that happened to this entity" (one document, class, submission,
-- receipt...) is a common lookup, and downloads now write audit rows too - but
-- audit_log only had (created_at desc) and (actor_id) indexes (0029). Without a
-- composite index on (entity_type, entity_id) that query scans the whole table.
-- Mirror comments_entity_idx (0003), with created_at DESC so the newest event
-- for an entity is the leading row.
create index if not exists audit_log_entity_idx
  on audit_log (entity_type, entity_id, created_at desc);

-- Retention (FIND-26) is intentionally NOT added here: how long audit_log is
-- kept is a compliance decision, not a mechanical one (audit trails are often
-- retained deliberately). Once a retention period is chosen, add a scheduled
-- purge (pg_cron) in its own migration, e.g.:
--   delete from audit_log where created_at < now() - interval '<N> days';

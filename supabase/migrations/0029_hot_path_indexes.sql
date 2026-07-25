-- 0029: indexes for the hottest read paths that currently seq-scan.
-- All additive and safe (IF NOT EXISTS); no data change.

-- Admin Users hub: every list/count/lookup filters profiles on role/status
-- (selectProfilesByFilter, selectProfilePage, countProfiles,
-- selectActiveProfilesByRoles, selectActive*Ids). profiles has only the PK +
-- unique(auth_user_id,email) indexes today.
create index if not exists profiles_role_status_idx on profiles (role, status);

-- History page: listAuditPage always orders by created_at desc and paginates
-- (OFFSET), optionally filtering by actor_id. audit_log is append-only and
-- unbounded with no index beyond its PK.
create index if not exists audit_log_created_idx on audit_log (created_at desc);
create index if not exists audit_log_actor_idx on audit_log (actor_id);

-- Header unread badge (selectUnreadNotificationIds) filters
-- profile_id + read_at IS NULL on most authenticated page loads. A partial index
-- on the unread rows is small and self-maintaining (read rows drop out).
create index if not exists notifications_unread_idx on notifications (profile_id) where read_at is null;

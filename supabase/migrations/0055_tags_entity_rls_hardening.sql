-- 0055_tags_entity_rls_hardening.sql
--
-- Follow-up to 0054_tags.sql. Tag ATTACHMENTS (`entity_tags`) should not be
-- broadly readable by every active user, because that leaks tagged entity ids
-- and cross-academy metadata. Attachment reads now go through the server-side
-- domain with the service role, so the open select policy is removed.

begin;

drop policy if exists entity_tags_read on entity_tags;

commit;

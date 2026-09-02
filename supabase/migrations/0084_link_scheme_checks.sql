-- 0084_link_scheme_checks.sql
--
-- V-04: 0081 enforced the http(s)-only scheme on submissions.drive_link at the COLUMN so
-- "every write path is covered", but the other stored link columns had no such constraint -
-- so the DB would still accept a javascript:/data: URL on resources.drive_link,
-- resource_versions.drive_link and assignments.attachment_drive_link for any future consumer
-- (an email template, a PDF, a CSV export, a native client) that lacks the render-side
-- safeExternalHref guard. Apply the SAME check, via a shared immutable is_http_link() so the
-- copies cannot drift. Also closes the V-01 tail: the service-role assignment-edit RPC now
-- cannot store a dangerous attachment link. Depends on 0081.

begin;

-- null / the empty-link sentinel '#' / an http(s) URL are the only accepted forms.
create or replace function is_http_link(link text) returns boolean
language sql immutable set search_path = public as $$
  select link is null or link = '#' or link ~* '^https?://'
$$;
-- 0034 revoked EXECUTE from PUBLIC; a CHECK constraint evaluates the function as the writing
-- role, so grant it to the roles that write these tables.
grant execute on function is_http_link(text) to authenticated, service_role;

alter table resources
  add constraint resources_drive_link_scheme check (is_http_link(drive_link));
alter table resource_versions
  add constraint resource_versions_drive_link_scheme check (is_http_link(drive_link));
alter table assignments
  add constraint assignments_attachment_link_scheme check (is_http_link(attachment_drive_link));

commit;

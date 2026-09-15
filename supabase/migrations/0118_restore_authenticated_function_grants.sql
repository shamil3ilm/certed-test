-- 0118: every function a signed-in user's writes and policies call is executable by them.
--
-- A signed-in user's own writes run as `authenticated`, and Postgres evaluates CHECK constraints
-- and RLS policies as that role. When authenticated cannot EXECUTE a function one of them calls,
-- the write fails with "permission denied for function ...". Staging hit exactly that: marking
-- notifications read (an UPDATE of read_at) re-checks notifications_link_scheme =
-- is_app_link(link), and staging's authenticated role had lost EXECUTE on is_app_link, so
-- "Mark all read" returned 500.
--
-- The chain has always granted these (0084, 0099 and earlier), but a database provisioned or
-- swept from the rebuild snapshot inherited that script's hand-kept allow-list, which once
-- omitted is_app_link. Grants are idempotent, so this states the full set again: on a database
-- built from the chain it changes nothing; on one that drifted it restores what is missing.
--
-- The set is exactly what the chain grants to authenticated (functions owned by extensions
-- excluded) - nothing more is exposed. Nothing is revoked here.

begin;

grant execute on function public.count_active_enrollments_per_class() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_status() to authenticated;
grant execute on function public.finance_totals_base(text) to authenticated;
grant execute on function public.is_active_admin() to authenticated;
grant execute on function public.is_active_sub_admin() to authenticated;
grant execute on function public.is_app_link(text) to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.is_enrolled(uuid) to authenticated;
grant execute on function public.is_http_link(text) to authenticated;
grant execute on function public.is_self_active(uuid) to authenticated;
grant execute on function public.mentors_class(uuid) to authenticated;
grant execute on function public.mentors_student(uuid) to authenticated;
grant execute on function public.replace_own_submission(uuid, text, text) to authenticated;
grant execute on function public.teaches_class(uuid) to authenticated;
grant execute on function public.teaches_class_write(uuid) to authenticated;
grant execute on function public.user_has_persona(uuid, persona_name, persona_scope_type, uuid) to authenticated;
grant execute on function public.user_is_admin(uuid) to authenticated;
grant execute on function public.user_is_mentor_for_student(uuid, uuid) to authenticated;

-- The link checks also run on the service role's writes (0084, 0099).
grant execute on function public.is_app_link(text) to service_role;
grant execute on function public.is_http_link(text) to service_role;

commit;

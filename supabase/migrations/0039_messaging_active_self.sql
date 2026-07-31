-- 0039_messaging_active_self.sql
--
-- Close the messaging active-status gap. Every other self-scoped table gates the
-- caller on profiles.status='active' (via is_self_active - submissions 0011,
-- enrollments 0011/0017, finance 0017, attendance 0011, notifications 0024) so a
-- disabled/revoked user with a still-valid JWT cannot read/write via direct
-- PostgREST until the token expires. Messaging did NOT: current_profile_id()
-- resolved identity purely from auth_user_id, and the conversations_read /
-- messages_read / messages_insert / conversation_participants_read policies gate on
-- is_conversation_member() (which keys off current_profile_id()) with no status
-- check - so a revoked participant could still read every conversation they're in
-- and post messages via the Data API.
--
-- Fix at the single choke point: gate current_profile_id() on status='active'. A
-- disabled user then resolves to NULL, so is_conversation_member() returns false
-- (no read) and the sender_id/created_by = current_profile_id() WITH CHECKs fail
-- (no insert). Active users are unaffected.

create or replace function current_profile_id() returns uuid
language sql security definer stable set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid() and status = 'active'
$$;

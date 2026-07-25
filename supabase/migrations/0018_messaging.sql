-- Messaging domain: direct + group conversations, separate from comments.
-- Tables: conversations, conversation_participants, messages.
-- Trust boundary is RLS: a participant (or an active admin, for moderation) may
-- read a conversation and its messages; only a participant may post, as
-- themselves; messages are immutable. Who may START a conversation with whom is
-- an app-layer recipient policy (personas), enforced in the service layer.

create type conversation_kind as enum ('direct', 'group');

-- Resolve the caller's domain identity (profiles.id) from the auth identity.
create or replace function current_profile_id() returns uuid
language sql security definer stable set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid()
$$;

create table conversations (
  id uuid primary key default gen_random_uuid(),
  kind conversation_kind not null,
  title text,                                    -- group name; null for direct
  created_by uuid references profiles(id) on delete set null,
  last_message_at timestamptz,                   -- for inbox ordering
  created_at timestamptz not null default now()
);

create table conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz,                       -- unread = messages.created_at > this
  joined_at timestamptz not null default now(),
  unique (conversation_id, profile_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_conversation_participants_profile on conversation_participants(profile_id);
create index idx_conversation_participants_conversation on conversation_participants(conversation_id);
create index idx_messages_conversation_created on messages(conversation_id, created_at);
create index idx_conversations_last_message on conversations(last_message_at desc);

comment on table conversations is 'Messaging: a direct (1:1) or group conversation. Separate from comments (which are contextual discussion on a submission/resource/meet).';
comment on table messages is 'Messaging: an immutable message in a conversation. body is plaintext in v1 (server-readable for moderation); structured to allow per-conversation E2EE later without a redesign.';

-- SECURITY DEFINER so RLS policies can consult participation without recursing
-- into conversation_participants' own RLS.
create or replace function is_conversation_member(p_conversation_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.profile_id = current_profile_id()
  )
$$;

alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;

-- conversations: a participant or an active admin reads; the creator inserts as
-- themselves (recipient eligibility is enforced in the service). No update/delete.
create policy conversations_read on conversations for select
  using (is_conversation_member(id) or is_active_admin());
create policy conversations_insert on conversations for insert
  with check (created_by = current_profile_id());

-- participants + read-state are written by the service role (create seeds the
-- roster, mark-read updates last_read_at); RLS only needs to scope reads so a
-- caller sees the roster of conversations they are in (or admins, all).
create policy conversation_participants_read on conversation_participants for select
  using (is_conversation_member(conversation_id) or is_active_admin());

-- messages: a participant or an active admin reads; only a participant may post,
-- and only as themselves. Immutable (no update/delete policy).
create policy messages_read on messages for select
  using (is_conversation_member(conversation_id) or is_active_admin());
create policy messages_insert on messages for insert
  with check (sender_id = current_profile_id() and is_conversation_member(conversation_id));

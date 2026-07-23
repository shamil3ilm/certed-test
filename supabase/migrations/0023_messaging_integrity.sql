-- Migration 0023: messaging integrity - inbox preview cache and one thread per pair.
--
-- Consolidates the drafted 0025 and 0028, neither of which had been applied. Both
-- change the conversation row for the same reason: the inbox was reading and
-- deduplicating threads in application code, which cost an N+1 on every load and
-- left a race that could create two direct threads for the same pair.

--
-- Why: listInbox() ran one "latest message" query PER conversation - an N+1 that
--      turns into visible messaging jitter as a user's conversation count grows on
--      a small Supabase instance. conversations already carries last_message_at for
--      ordering; add the last message's body + sender so the inbox reads a
--      conversation's preview and unread state directly, in one bounded query.
--      sendMessage writes all three on every send (the only message-insert path).
--
-- Idempotent (add column if not exists). Depends on: 0018 (conversations, profiles).

alter table conversations add column if not exists last_message_body text;
alter table conversations
  add column if not exists last_message_sender_id uuid references profiles(id) on delete set null;

-- ---------------------------------------------------------------------------

--
-- Why: createConversation deduped a 1:1 thread by LOOKING one up and then inserting -
--      a check-then-act race. Two concurrent "message X" clicks could both find
--      nothing and both insert, leaving the pair with two direct threads (split
--      history, and an inbox showing the same person twice).
--
-- Fix: store a canonical pair key on the conversation (the two profile ids sorted and
--      joined, so the pair maps to exactly one value regardless of who started it) and
--      enforce a PARTIAL unique index over direct threads that carry one. The app sets
--      the key on insert and, on a unique violation, returns the thread the race winner
--      created - so the loser silently joins the existing conversation.
--
-- Backfill is deliberately conservative: only the EARLIEST direct thread per pair gets
-- a key, so any pre-existing duplicates keep a null key and the unique index still
-- builds (nulls are excluded from a partial unique index). Legacy duplicates are left
-- untouched rather than merged - the app's lookup already returns one of them, and
-- silently deleting message history in a migration would be worse.
--
-- Idempotent. Depends on: 0018 (conversations, conversation_participants).

alter table conversations add column if not exists direct_key text;

-- Earliest direct thread per participant pair gets the canonical key.
with pair as (
  select cp.conversation_id, string_agg(cp.profile_id::text, ':' order by cp.profile_id::text) as k
  from conversation_participants cp
  group by cp.conversation_id
  having count(*) = 2
),
ranked as (
  select c.id, p.k, row_number() over (partition by p.k order by c.created_at, c.id) as rn
  from conversations c
  join pair p on p.conversation_id = c.id
  where c.kind = 'direct'
    and c.direct_key is null
    -- Skip pairs already keyed by an earlier run, or re-running would promote the
    -- previously-skipped duplicate into the same key and violate the unique index.
    and not exists (
      select 1 from conversations x where x.kind = 'direct' and x.direct_key = p.k
    )
)
update conversations c
set direct_key = r.k
from ranked r
where c.id = r.id and r.rn = 1;

create unique index if not exists conversations_direct_key_uniq
  on conversations (direct_key)
  where kind = 'direct' and direct_key is not null;

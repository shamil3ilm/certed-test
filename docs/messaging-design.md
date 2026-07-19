# Messaging domain — design (v1)

A **separate** domain from comments. Comments stay as contextual discussion on a
submission / resource / meet. Messaging is standalone: its own schema, RLS,
services, and UI. Do not reuse the comments table.

## Scope (v1)
- Direct (1:1) and group conversations.
- Inbox (conversation list with unread counts) + thread view.
- Unread tracking via `conversation_participants.last_read_at`.
- Conversation creation restricted to **allowed recipients only** (policy below).
- Server-readable (moderation-capable). Structured so conversation-type-specific
  E2EE can be added later without a schema redesign (see "Future E2EE").

## Tables

```
conversations
  id            uuid pk
  kind          conversation_kind  -- 'direct' | 'group'
  title         text null          -- group name; null for direct
  created_by    uuid -> profiles(id)
  created_at    timestamptz

conversation_participants
  id              uuid pk
  conversation_id uuid -> conversations(id) on delete cascade
  profile_id      uuid -> profiles(id) on delete cascade
  last_read_at    timestamptz null   -- unread = messages.created_at > this
  joined_at       timestamptz
  unique(conversation_id, profile_id)

messages
  id              uuid pk
  conversation_id uuid -> conversations(id) on delete cascade
  sender_id       uuid -> profiles(id)
  body            text               -- plaintext in v1 (see Future E2EE)
  created_at      timestamptz
  index(conversation_id, created_at)
```

Unread is a `last_read_at` column, not a `message_reads` table: a per-participant
watermark is enough for inbox counts and read receipts, and avoids a row per
message per reader. (A `message_reads` table can be added later if per-message
receipts are needed.)

Direct-conversation dedupe: enforce "one direct conversation per unordered pair"
in the service (look up an existing direct conversation whose participant set is
exactly {a,b} before creating) rather than a DB constraint, since the pair spans
two participant rows.

## RLS (the server trust boundary)

- **conversations**: a row is readable if the caller is a participant, OR the
  caller is an active admin (moderation). Insert: any active user (the recipient
  policy is enforced in the service, see below). No update/delete in v1.
- **conversation_participants**: readable if the caller participates in that
  conversation, or is an active admin. Insert is service-role only (adding
  participants is part of create-conversation). A participant may update **only
  their own** row's `last_read_at`.
- **messages**: readable if the caller participates in the conversation, or is an
  active admin. Insert: only a participant of the conversation, and only as
  themselves (`sender_id = caller`). No update/delete in v1 (immutable log).

Admin read-all gives moderation without a separate audit copy of message bodies.

## Recipient policy (who may START a conversation with whom)

This is **app-layer**, centralized in `canMessage(actor, recipientId)` /
`listMessageableContacts(actor)`, because eligibility depends on persona
relationships RLS can't cheaply express. Personas, not `profiles.role`, drive it:

| Actor persona | May message |
|---|---|
| admin | anyone |
| sub_admin | users they can manage (teachers + students; never the admin tier) |
| tutor | students in classes they teach + their assigned mentees |
| mentor | their assigned mentees |
| student | their tutors (teachers of their classes) + their mentors + admins/sub_admins (support) |
| guardian / finance_operator / assistant / executive (future) | add a policy branch — **no schema change** |

The policy is a pure function over already-loaded relationships (class
memberships, mentorships, personas), so new personas plug in by extending the
function, not the tables.

## Moderation / supervision hooks
- Admin RLS read-all on conversations/participants/messages -> admin-visible
  metadata and admin-readable content in v1.
- Audit events: `conversation.create` (always); `message.send` optional/off by
  default to avoid duplicating bodies; `conversation.admin_view` when an admin
  opens a conversation they are not a participant of (administrative intervention).

## Public interfaces (services)
- `listInbox(actor)` -> conversations with last message + unread count.
- `loadThread(actor, conversationId)` -> messages + participants (RLS-gated).
- `sendMessage(actor, conversationId, body)` -> inserts (participant-gated).
- `createConversation(actor, { recipientIds, title? })` -> validates every
  recipient via `canMessage`, dedupes a direct pair, seeds participants.
- `markRead(actor, conversationId)` -> sets the caller's `last_read_at = now()`.
- `listMessageableContacts(actor)` -> the allowed recipient list for the composer.

## UI entry points
- Inbox link in the portal nav/header (new `viewMessages` capability, held by all
  active personas) with an unread badge.
- "Message" CTA on the Users hub rows (where policy allows).
- "Message" CTA in student/mentee/class-people contexts where policy allows.

## Future E2EE (not v1, but structured for)
- v1 stores `messages.body` as plaintext; server can read (moderation).
- To add E2EE later per conversation-kind: add a nullable `ciphertext` column +
  a `message_envelopes` table (per-recipient wrapped keys) and a
  `conversations.encryption` marker. `body` becomes null for encrypted
  conversations. No table is dropped or repurposed, so v1 rows stay valid.

## Migration
`supabase/migrations/0018_messaging.sql` (enum + 3 tables + indexes + RLS +
`last_read_at` self-update policy). Rebuild snapshot updated to match. Delivered
as a standalone .sql for the Supabase editor per the project workflow.

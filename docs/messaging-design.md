# Messaging Domain Design

- Status: Current design reference
- Scope: v1 messaging model

Messaging is a separate domain from comments.

Comments remain contextual discussion attached to:

- submissions
- resources
- meet links

Messaging is standalone and has its own:

- schema
- RLS
- services
- UI

## Scope

Current messaging scope includes:

- direct conversations
- group conversations
- inbox listing
- thread view
- unread tracking
- allowed-recipient policy
- admin-readable moderation surface

## Core tables

### `conversations`

Purpose:

- direct and group thread containers

Current shape includes:

- `kind`
- `title`
- `created_by`
- `last_message_at`
- `last_message_body`
- `last_message_sender_id`
- `direct_key`

### `conversation_participants`

Purpose:

- membership
- joined-at state
- unread watermark through `last_read_at`

### `messages`

Purpose:

- immutable thread messages

## Current unread model

Unread state is tracked through:

- `conversation_participants.last_read_at`

This keeps inbox read-state bounded without requiring a per-message read table.

## Current recipient policy

Conversation creation is restricted by app-layer policy.

The policy is centralized through:

- `canMessage(actor, recipientId)`
- `listMessageableContacts(actor)`

Current intent by persona:

- admin: anyone
- sub-admin: users they can manage
- tutor: students they teach and students they mentor
- mentor: their mentees
- student: their tutors, their mentors, and admin-tier support contacts

Implementation notes:

- recipient eligibility must remain centralized in one policy surface
- future personas must not inherit contacts implicitly
- comments are not a fallback messaging system and should stay separate

Future personas should extend this policy in code without requiring schema redesign.

## Current trust boundary

RLS remains the database trust boundary.

The broad rules are:

- conversations are readable by participants and intended admin paths
- participant rows are readable within conversation scope
- messages are readable by participants and inserted only by participants

## Service surface

Current messaging service responsibilities include:

- inbox loading
- thread loading
- direct-thread dedupe
- message send
- mark read
- leave conversation
- recipient policy enforcement

## Current implementation notes

Recent messaging migrations added:

- denormalized last-message fields for inbox performance
- canonical direct-thread keys

These support:

- cheaper inbox reads
- stable one-thread-per-direct-pair behavior

## Future extension points

Possible later additions include:

- richer moderation tooling
- message retention rules
- attachment support
- conversation settings
- stronger encryption model

Any such change should preserve the separation between:

- comments
- messaging

## Related docs

- [schema-reference.md](./schema-reference.md)
- [persona-model.md](./persona-model.md)
- [architecture-rules.md](./architecture-rules.md)
- [workflow-invariants.md](./workflow-invariants.md)

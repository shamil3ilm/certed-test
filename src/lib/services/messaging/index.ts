/**
 * Messaging domain. Split by concern so no single file is the only place to
 * understand the workflow contract:
 *
 *  - policies.ts  who may participate / still message whom
 *  - commands.ts  create, send, mark-read, leave
 *  - queries.ts   inbox list and thread window
 *
 * All table access lives in src/lib/data/messages.
 */
export { createConversation, sendMessage, markRead, leaveConversation } from './commands'
export type { CreateConversationInput } from './commands'

export { listInbox, loadThread } from './queries'
export type { InboxItem, ThreadData } from './queries'

export { assertParticipant, assertStillMessageable, directKeyFor } from './policies'

// Row shapes originate in the data layer; re-exported under the names the app uses.
export type { ConversationKind, ConversationRow as Conversation, MessageRow as Message } from '@/lib/data/messages'

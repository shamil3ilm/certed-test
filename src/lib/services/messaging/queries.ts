import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { NotFoundError } from '@/lib/errors'
import { getProfileNamesByIds } from '@/lib/services/users'
import {
  selectConversationById,
  selectConversationPage,
  selectMessageWindow,
  searchMessages,
  selectMyParticipations,
  selectParticipantIds,
  selectParticipantsForConversations,
  type ConversationKind,
  type ConversationRow,
  type MessageRow,
} from '@/lib/data/messages'
import { assertParticipant } from './policies'
import { toRange, type Page } from '@/lib/pagination'

/** Read paths: the inbox list and a thread window, shaped for the UI. */

export type InboxItem = {
  id: string
  kind: ConversationKind
  title: string
  lastMessage: string | null
  lastAt: string | null
  hasUnread: boolean
}

export type ThreadData = {
  conversation: ConversationRow
  title: string
  messages: MessageRow[]
  participants: { id: string; name: string }[]
  hasEarlier: boolean // older messages exist before the first one shown
  earlierCursor: string | null // created_at of the oldest shown message (the "load earlier" cursor)
  isLatestWindow: boolean // true when showing the most recent window (no `before`)
  searchQuery: string | null
}

/** Messages loaded per thread window; older ones load on demand via a cursor. */
const MESSAGE_PAGE = 50

/** A null title (every minimal group) is auto-titled from the other participants;
 *  an explicit group title, if ever set, wins. */
function titleFor(kind: ConversationKind, explicit: string | null, otherNames: string[]): string {
  return explicit ?? (otherNames.join(', ') || (kind === 'group' ? 'Group' : 'Unknown'))
}

/**
 * The caller's inbox: their conversations, newest activity first, each with a title,
 * a last-message preview and an unread flag. Bounded - the last message is
 * denormalized onto the conversation row (0025), so there is no per-thread query.
 * Unread is last-message-based: true when the newest message is from someone else
 * and is newer than the caller's read watermark.
 */
export async function listInbox(actor: Profile, opts: { page: number; pageSize: number }): Promise<Page<InboxItem>> {
  const parts = await selectMyParticipations(actor.id)
  if (parts.length === 0) return { items: [], total: 0 }
  const convIds = parts.map((p) => p.conversation_id)
  const lastReadByConv = new Map(parts.map((p) => [p.conversation_id, p.last_read_at]))

  // Order and slice in SQL, then resolve names for the PAGE only. This used to load every
  // conversation the caller is in - and every participant of every one of them - to render
  // twenty rows.
  const { items: conversations, total } = await selectConversationPage(convIds, toRange(opts.page, opts.pageSize))
  const pageIds = conversations.map((c) => c.id)
  const allParts = await selectParticipantsForConversations(pageIds)

  const otherIds = allParts.filter((p) => p.profile_id !== actor.id).map((p) => p.profile_id)
  const names = await getProfileNamesByIds([...new Set(otherIds)])

  const othersByConv = new Map<string, string[]>()
  for (const p of allParts) {
    if (p.profile_id === actor.id) continue
    const list = othersByConv.get(p.conversation_id) ?? []
    list.push(names.get(p.profile_id) ?? 'Unknown')
    othersByConv.set(p.conversation_id, list)
  }

  const items = conversations.map((c) => {
    const readAt = lastReadByConv.get(c.id) ?? null
    const lastAt = c.last_message_at
    const hasUnread = lastAt != null && c.last_message_sender_id !== actor.id && (readAt == null || lastAt > readAt)
    return {
      id: c.id,
      kind: c.kind,
      title: titleFor(c.kind, c.title, othersByConv.get(c.id) ?? []),
      lastMessage: c.last_message_body ?? null,
      lastAt,
      hasUnread,
    }
  })
  // No re-sort: the query already ordered by last_message_at, and re-sorting here would
  // only reorder WITHIN the page, which cannot fix - but can contradict - the page it was
  // given.
  return { items, total }
}

/** A thread window for a conversation the caller is in (else NotFound/Permission).
 *  Shows the most recent MESSAGE_PAGE messages by default; pass `before` (a message
 *  created_at) to load the window of older messages just before it. */
export async function loadThread(
  actor: Profile,
  conversationId: string,
  opts: { before?: string; limit?: number; q?: string } = {},
): Promise<ThreadData> {
  await assertParticipant(actor, conversationId)
  const conversation = await selectConversationById(conversationId)
  if (!conversation) throw new NotFoundError('Conversation not found.')

  const limit = opts.limit ?? MESSAGE_PAGE
  const query = opts.q?.trim() || ''
  // The cursor is a message created_at, but it arrives from the URL - a hand-edited
  // `?before=garbage` would otherwise reach the created_at timestamp comparison and
  // 500. Ignore an unparseable cursor and just show the latest window.
  const before = opts.before && !Number.isNaN(Date.parse(opts.before)) ? opts.before : undefined
  const [desc, participantIds] = await Promise.all([
    query ? searchMessages(conversationId, query, limit) : selectMessageWindow(conversationId, { before, limit }),
    selectParticipantIds(conversationId),
  ])
  const hasEarlier = query ? false : desc.length > limit
  const shown = desc.slice(0, limit).reverse() // drop the sentinel; ascending for display

  const names = await getProfileNamesByIds(participantIds)
  const participants = participantIds.map((id) => ({ id, name: names.get(id) ?? 'Unknown' }))
  const otherNames = participants.filter((p) => p.id !== actor.id).map((o) => o.name)

  return {
    conversation,
    title: titleFor(conversation.kind, conversation.title, otherNames),
    messages: shown,
    participants,
    hasEarlier,
    earlierCursor: shown[0]?.created_at ?? null,
    isLatestWindow: !before && !query,
    searchQuery: query || null,
  }
}

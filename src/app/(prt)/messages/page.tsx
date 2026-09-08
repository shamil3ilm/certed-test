import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { listInbox } from '@/lib/services/messaging'
import { listMessageableContacts } from '@/lib/messaging/recipient-policy'
import { clampPage, parsePageParam, totalPages } from '@/lib/pagination'
import { Avatar, Badge, CARD, EmptyState, FilterBar, PageHeader, PaginationBar, SelectFilterField, cx } from '@/lib/ui'
import { LocalTime } from '../LocalTime'
import { NewChatLauncher } from './NewChatLauncher'

const INBOX_PAGE_SIZE = 20

/** An inbox URL carrying the filter, so paging never silently drops it. */
function inboxUrl(unread: boolean, page: number): string {
  const sp = new URLSearchParams()
  if (unread) sp.set('show', 'unread')
  if (page > 1) sp.set('page', String(page))
  const query = sp.toString()
  return query ? `/messages?${query}` : '/messages'
}

export default async function MessagesPage(props: { searchParams: Promise<{ page?: string; show?: string }> }) {
  const { page, show } = await props.searchParams
  const unreadOnly = show === 'unread'
  const me = await requireCapability('viewMessages')
  const requestedPage = parsePageParam(page)
  const [firstRead, contacts] = await Promise.all([
    listInbox(me, { page: requestedPage, pageSize: INBOX_PAGE_SIZE, unreadOnly }),
    listMessageableContacts(me),
  ])
  // A stale `?page=99` reads back an empty slice; show the last real page instead of a
  // blank inbox with no way back but editing the URL.
  const currentPage = clampPage(requestedPage, firstRead.total, INBOX_PAGE_SIZE)
  const { items: pagedInbox, total } =
    currentPage === requestedPage
      ? firstRead
      : await listInbox(me, { page: currentPage, pageSize: INBOX_PAGE_SIZE, unreadOnly })

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Messages" description="Your conversations." />

      <NewChatLauncher contacts={contacts} />

      <FilterBar className="mt-4" clearHref="/messages" showClear={unreadOnly}>
        <SelectFilterField label="Show" name="show" defaultValue={unreadOnly ? 'unread' : ''}>
          <option value="">All conversations</option>
          <option value="unread">Unread only</option>
        </SelectFilterField>
      </FilterBar>

      {total === 0 ? (
        <EmptyState>
          {/* "Nothing unread" is good news; "no conversations yet" is a different state and
              saying the second reads as though a thread has gone missing. */}
          {unreadOnly ? 'Nothing unread.' : 'No conversations yet.'}
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {pagedInbox.map((c) => (
            <li key={c.id}>
              <Link
                href={`/messages/${c.id}`}
                className={cx(
                  CARD,
                  'group block p-3 transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    name={c.title}
                    size="md"
                    className={c.kind === 'group' ? 'bg-primary/10 text-primary border-primary/15' : ''}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{c.title}</p>
                      <Badge tone={c.kind === 'group' ? 'warning' : 'slate'}>
                        {c.kind === 'group' ? 'Group' : 'Direct'}
                      </Badge>
                      {c.hasUnread && <Badge tone="primary">Unread</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.lastMessage ?? 'No messages yet.'}</p>
                  </div>
                  {c.lastAt && (
                    <span className="shrink-0 pt-0.5 text-meta text-slate-600">
                      <LocalTime iso={c.lastAt} />
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <PaginationBar
        page={currentPage}
        totalPages={totalPages(total, INBOX_PAGE_SIZE)}
        total={total}
        previousHref={currentPage > 1 ? inboxUrl(unreadOnly, currentPage - 1) : undefined}
        nextHref={currentPage < totalPages(total, INBOX_PAGE_SIZE) ? inboxUrl(unreadOnly, currentPage + 1) : undefined}
        className="mt-4"
      />
    </main>
  )
}

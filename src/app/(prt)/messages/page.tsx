import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { listInbox } from '@/lib/services/messaging'
import { listMessageableContacts } from '@/lib/messaging/recipient-policy'
import { pageSlice, parsePageParam, totalPages } from '@/lib/pagination'
import { PageHeader, EmptyState, Badge, Avatar, CARD, PaginationBar, cx } from '@/lib/ui'
import { LocalTime } from '../LocalTime'
import { NewChatLauncher } from './NewChatLauncher'

const INBOX_PAGE_SIZE = 20

export default async function MessagesPage(props: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await props.searchParams
  const me = await requireCapability('viewMessages')
  const [inbox, contacts] = await Promise.all([listInbox(me), listMessageableContacts(me)])
  const currentPage = parsePageParam(page)
  const pagedInbox = pageSlice(inbox, currentPage, INBOX_PAGE_SIZE)

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Messages" description="Your conversations." />

      <NewChatLauncher contacts={contacts} />

      {inbox.length === 0 ? (
        <EmptyState>No conversations yet.</EmptyState>
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
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{c.lastMessage ?? 'No messages yet.'}</p>
                  </div>
                  {c.lastAt && (
                    <span className="shrink-0 pt-0.5 text-[11px] text-slate-400">
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
        totalPages={totalPages(inbox.length, INBOX_PAGE_SIZE)}
        total={inbox.length}
        previousHref={currentPage > 1 ? `/messages?page=${currentPage - 1}` : undefined}
        nextHref={
          currentPage < totalPages(inbox.length, INBOX_PAGE_SIZE) ? `/messages?page=${currentPage + 1}` : undefined
        }
        className="mt-4"
      />
    </main>
  )
}

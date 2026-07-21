import { requireCapability } from '@/lib/auth/require-role'
import { listInbox } from '@/lib/services/messaging'
import { listMessageableContacts } from '@/lib/messaging/recipient-policy'
import { NewMessageForm } from './NewMessageForm'
import { PageHeader, Card, EmptyState, Badge, ListRow } from '../ui'
import { LocalTime } from '../LocalTime'

export default async function MessagesPage() {
  const me = await requireCapability('viewMessages')
  const [inbox, contacts] = await Promise.all([listInbox(me), listMessageableContacts(me)])

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Messages" description="Your conversations. Start a new one with anyone you're allowed to contact." />

      <Card className="mb-5 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">New message</h2>
        {contacts.length === 0 ? (
          <p className="text-sm text-slate-400">You have no contacts you can message yet.</p>
        ) : (
          <NewMessageForm contacts={contacts} />
        )}
      </Card>

      {inbox.length === 0 ? (
        <EmptyState>No conversations yet.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {inbox.map((c) => (
            <li key={c.id}>
              <ListRow
                href={`/messages/${c.id}`}
                title={
                  <span className="inline-flex items-center gap-2">
                    {c.title}
                    {c.hasUnread && <Badge tone="primary">New</Badge>}
                  </span>
                }
                subtitle={c.lastMessage ?? 'No messages yet.'}
                trailing={
                  c.lastAt ? (
                    <span className="shrink-0 text-xs text-slate-400">
                      <LocalTime iso={c.lastAt} />
                    </span>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { loadThread } from '@/lib/services/messaging'
import { PermissionError, NotFoundError } from '@/lib/errors'
import { MarkRead } from '../MarkRead'
import { MessageComposer } from './MessageComposer'
import { leaveConversationAction } from '../actions'
import { ConfirmSubmit } from '../../ConfirmSubmit'
import { Avatar, BackLink, Badge, Card, EmptyState, PageHeader } from '@/lib/ui'
import { LocalTime } from '../../LocalTime'
import { RenameGroupForm } from './RenameGroupForm'

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { before?: string; q?: string }
}) {
  const me = await requireCapability('viewMessages')

  let data
  try {
    data = await loadThread(me, params.id, { before: searchParams?.before, q: searchParams?.q })
  } catch (error) {
    if (error instanceof PermissionError || error instanceof NotFoundError) notFound()
    throw error
  }

  const nameById = new Map(data.participants.map((p) => [p.id, p.name]))

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      {/* Only mark read from the latest window - jumping to older messages must
          not silently clear the unread flag on newer ones. */}
      {data.isLatestWindow && <MarkRead conversationId={params.id} />}
      <BackLink href="/messages">Back to messages</BackLink>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title={data.title}
          description={
            data.searchQuery
              ? `Showing results for "${data.searchQuery}"`
              : data.conversation.kind === 'group'
                ? `${data.participants.length} participants`
                : undefined
          }
        />
        {data.conversation.kind === 'group' && (
          <form action={leaveConversationAction} className="shrink-0 pt-1">
            <input type="hidden" name="conversation_id" value={params.id} />
            <ConfirmSubmit
              className="btn btn-sm btn-ghost text-red-600"
              title="Leave conversation?"
              message="It disappears from your inbox and you can no longer read or reply. Others keep the thread."
              confirmLabel="Leave"
            >
              Leave
            </ConfirmSubmit>
          </form>
        )}
      </div>

      {data.conversation.kind === 'group' && (
        <Card className="mt-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">Group conversation</Badge>
            <span className="text-xs text-slate-400">Everyone here can read new replies.</span>
          </div>
          <RenameGroupForm conversationId={params.id} initialTitle={data.conversation.title ?? data.title} />
          <div className="mt-3 flex flex-wrap gap-2">
            {data.participants.map((participant) => {
              const mine = participant.id === me.id
              return (
                <div
                  key={participant.id}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <Avatar name={participant.name} size="sm" />
                  <span className="text-sm font-medium text-slate-700">
                    {participant.name}
                    {mine ? ' (You)' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <div className="mt-4 space-y-2">
        <Card className="p-3">
          <form action={`/messages/${params.id}`} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-500">Search chat</span>
              <input
                name="q"
                defaultValue={data.searchQuery ?? ''}
                className="w-full"
                placeholder="Search messages..."
              />
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-sm btn-soft">
                Search
              </button>
              {data.searchQuery && (
                <Link href={`/messages/${params.id}`} className="btn btn-sm btn-ghost">
                  Clear
                </Link>
              )}
            </div>
          </form>
        </Card>
        {data.hasEarlier && data.earlierCursor && (
          <div className="flex justify-center pb-1">
            <Link
              href={`/messages/${params.id}?before=${encodeURIComponent(data.earlierCursor)}`}
              className="btn btn-sm btn-soft"
            >
              Load earlier messages
            </Link>
          </div>
        )}
        {data.messages.length === 0 && <EmptyState>No messages yet.</EmptyState>}
        {data.messages.map((m) => {
          const mine = m.sender_id === me.id
          return (
            <div key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  mine
                    ? 'max-w-[80%] rounded-2xl bg-primary px-3 py-2 text-sm text-white'
                    : 'max-w-[80%] rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-800'
                }
              >
                {!mine && (
                  <p className="mb-0.5 text-xs font-semibold text-slate-500">
                    {m.sender_id ? (nameById.get(m.sender_id) ?? 'Unknown') : 'Unknown'}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cxTime(mine)}>
                  <LocalTime iso={m.created_at} />
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {data.isLatestWindow ? (
        <MessageComposer conversationId={params.id} />
      ) : (
        <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center text-sm text-slate-500">
          You&apos;re viewing earlier messages.{' '}
          <Link href={`/messages/${params.id}`} className="font-medium text-primary hover:underline">
            Jump to latest
          </Link>{' '}
          to reply.
        </p>
      )}
    </main>
  )
}

function cxTime(mine: boolean): string {
  return mine ? 'mt-0.5 text-right text-[10px] text-white/70' : 'mt-0.5 text-right text-[10px] text-slate-400'
}

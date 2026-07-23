import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { loadThread } from '@/lib/services/messaging'
import { PermissionError, NotFoundError } from '@/lib/errors'
import { MarkRead } from '../MarkRead'
import { MessageComposer } from './MessageComposer'
import { leaveConversationAction } from '../actions'
import { ConfirmSubmit } from '../../ConfirmSubmit'
import { EmptyState, PageHeader } from '@/lib/ui'
import { LocalTime } from '../../LocalTime'

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { before?: string }
}) {
  const me = await requireCapability('viewMessages')

  let data
  try {
    data = await loadThread(me, params.id, { before: searchParams?.before })
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
      <Link
        href="/messages"
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:-translate-x-0.5 hover:text-primary"
      >
        Back to messages
      </Link>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title={data.title}
          description={data.conversation.kind === 'group' ? `${data.participants.length} participants` : undefined}
        />
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
      </div>

      <div className="mt-4 space-y-2">
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
        {data.messages.length === 0 && <EmptyState>No messages yet. Say hello.</EmptyState>}
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

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { loadThread } from '@/lib/services/messaging'
import { PermissionError, NotFoundError } from '@/lib/errors'
import { MarkRead } from '../MarkRead'
import { MessageComposer } from './MessageComposer'
import { leaveConversationAction } from '../actions'
import { ConfirmSubmit } from '../../ConfirmSubmit'
import { Avatar, BackLink, Badge, EmptyState, FilterBar, PageHeader, SearchFilterField } from '@/lib/ui'
// Card is deep-imported from the layout module, NOT the '@/lib/ui' barrel, on purpose:
// under `next build --webpack` the barrel pull can drop THIS page's client boundary
// (./MessageComposer) from the React client-reference manifest, so the thread page 500s
// ("Something went wrong") for every user who opens a conversation. Invisible in dev,
// typecheck, and unit tests - only E2E caught it. Do NOT "simplify" this back to the
// barrel. The post-build guard (scripts/check-client-manifest.mjs) fails the build if the
// omission ever recurs on any page.
import { Card } from '@/lib/ui/layout'
import { LocalTime } from '../../LocalTime'
import { RenameGroupForm } from './RenameGroupForm'

export default async function ThreadPage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ before?: string; q?: string }>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
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
      <PageHeader
        title={data.title}
        description={
          data.searchQuery
            ? `Showing results for "${data.searchQuery}"`
            : data.conversation.kind === 'group'
              ? `${data.participants.length} participants`
              : undefined
        }
        action={
          data.conversation.kind === 'group' ? (
            <form action={leaveConversationAction} className="shrink-0 pt-1">
              <input type="hidden" name="conversation_id" value={params.id} />
              <ConfirmSubmit
                className="btn btn-sm btn-ghost text-red-600"
                title="Leave conversation?"
                message="It disappears from your inbox and you can no longer read or reply. Others keep the thread."
                confirmLabel="Leave"
                pendingLabel="Leaving..."
              >
                Leave
              </ConfirmSubmit>
            </form>
          ) : undefined
        }
      />

      {data.conversation.kind === 'group' && (
        <Card className="mt-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">Group conversation</Badge>
            <span className="text-xs text-slate-600">Everyone here can read new replies.</span>
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
          <FilterBar clearHref={`/messages/${params.id}`} showClear={Boolean(data.searchQuery)} applyLabel="Search">
            <SearchFilterField
              label="Search chat"
              name="q"
              defaultValue={data.searchQuery ?? ''}
              placeholder="Search messages..."
            />
          </FilterBar>
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
                  <p className="mb-0.5 text-xs font-semibold text-slate-600">
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
        <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center text-sm text-slate-600">
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
  return mine ? 'mt-0.5 text-right text-meta text-white/70' : 'mt-0.5 text-right text-meta text-slate-600'
}

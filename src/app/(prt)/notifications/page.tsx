import { requireActiveProfile } from '@/lib/auth/require-role'
import { listMyNotifications } from '@/lib/services/notifications'
import { PageHeader, EmptyState, cx } from '@/lib/ui'
import { LocalTime } from '../LocalTime'
import { markAllNotificationsReadAction } from './actions'

/** Per-kind chip. Plain ASCII text (no emoji/glyphs) so the feed renders
 *  identically everywhere, per the portal's text standard. */
const KIND_META: Record<string, { label: string; className: string }> = {
  message: { label: 'Message', className: 'bg-sky-50 text-sky-700' },
  grade: { label: 'Grade', className: 'bg-emerald-50 text-emerald-700' },
  announcement: { label: 'Announcement', className: 'bg-amber-50 text-amber-700' },
}

export default async function NotificationsPage() {
  const me = await requireActiveProfile()
  const items = await listMyNotifications(me.id, 50)
  const hasUnread = items.some((n) => !n.read_at)

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Notifications" />
        {hasUnread && (
          <form action={markAllNotificationsReadAction} className="shrink-0 pt-1">
            <button className="btn btn-sm btn-soft">Mark all read</button>
          </form>
        )}
      </div>

      <ul className="mt-4 space-y-2">
        {items.length === 0 && (
          <EmptyState as="li">Nothing yet - grades, messages and class announcements show up here.</EmptyState>
        )}
        {items.map((n) => {
          const kind = KIND_META[n.kind] ?? { label: n.kind, className: 'bg-slate-100 text-slate-600' }
          const inner = (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', kind.className)}>
                    {kind.label}
                  </span>
                  <p className="truncate text-sm font-medium text-slate-800">{n.title}</p>
                </div>
                {!n.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="unread" />}
              </div>
              {n.body && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{n.body}</p>}
              <p className="mt-1 text-xs text-slate-400">
                <LocalTime iso={n.created_at} />
              </p>
            </>
          )
          const cardClass = cx(
            'block rounded-2xl border p-3 transition',
            n.read_at
              ? 'border-slate-200 bg-white hover:bg-slate-50'
              : 'border-primary/20 bg-primary/5 hover:bg-primary/10',
          )
          return (
            <li key={n.id}>
              {n.link ? (
                <a href={n.link} className={cardClass}>
                  {inner}
                </a>
              ) : (
                <div className={cardClass}>{inner}</div>
              )}
            </li>
          )
        })}
      </ul>
    </main>
  )
}

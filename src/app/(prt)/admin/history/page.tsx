import { requireRole } from '@/lib/auth/requireRole'
import { listAudit } from '@/lib/repos/audit'
import { getProfilesByIds } from '@/lib/repos/users'
import { PageHeader, EmptyState } from '../../ui'
import { LocalTime } from '../../LocalTime'

// Split an action code ("submission.grade") into scope + verb for display.
function actionParts(action: string): { scope: string; verb: string } {
  const i = action.indexOf('.')
  return i === -1 ? { scope: '', verb: action } : { scope: action.slice(0, i), verb: action.slice(i + 1) }
}

// Colour the verb by whether it created/removed something, so the log scans fast.
const VERB_TONE: Record<string, string> = {
  add: 'text-emerald-700', create: 'text-emerald-700', restore: 'text-emerald-700',
  assign: 'text-emerald-700', issue: 'text-emerald-700', update: 'text-slate-700',
  edit: 'text-slate-700', grade: 'text-slate-700', password: 'text-slate-700', mark: 'text-slate-700',
  revoke: 'text-red-700', delete: 'text-red-700', archive: 'text-red-700',
  remove: 'text-red-700', void: 'text-red-700',
}

const LIMIT = 250

export default async function HistoryPage() {
  await requireRole(['admin'])
  const rows = await listAudit(LIMIT)
  const actors = await getProfilesByIds(rows.map((r) => r.actor_id).filter((x): x is string => !!x))

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Activity log"
        description="Sensitive actions across the academy — user changes, grading, finance and more — newest first. Read-only."
      />

      {rows.length === 0 ? (
        <EmptyState>No activity recorded yet.</EmptyState>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">When</th>
                <th className="text-left">Who</th>
                <th className="text-left">Action</th>
                <th className="text-left">Target</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const actor = r.actor_id ? actors.get(r.actor_id) : null
                const { scope, verb } = actionParts(r.action)
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-slate-500">
                      <LocalTime iso={r.created_at} mode="datetime" />
                    </td>
                    <td className="whitespace-nowrap text-slate-700">
                      {actor ? (actor.full_name ?? actor.email) : <span className="italic text-slate-400">System</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      {scope && <span className="text-slate-400">{scope} · </span>}
                      <span className={`font-semibold ${VERB_TONE[verb] ?? 'text-slate-700'}`}>{verb}</span>
                    </td>
                    <td className="whitespace-nowrap text-slate-500">
                      {r.entity_type}
                      {r.entity_id && <span className="ml-1.5 font-mono text-xs text-slate-400">{r.entity_id.slice(0, 8)}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length >= LIMIT && (
        <p className="mt-3 text-xs text-slate-400">Showing the most recent {LIMIT} actions.</p>
      )}
    </main>
  )
}

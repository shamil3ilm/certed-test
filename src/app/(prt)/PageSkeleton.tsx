/** Neutral loading skeleton for a portal page. Each route's loading.tsx passes
 *  the SAME max-width its page uses, so the skeleton doesn't visibly jump to a
 *  different content width when the real page resolves. Pass the full Tailwind
 *  class (e.g. "max-w-3xl") so it survives purge. */
const STAT_SKELETON_KEYS = ['stat-1', 'stat-2', 'stat-3', 'stat-4'] as const

export function PageSkeleton({ maxWidth = 'max-w-5xl' }: { maxWidth?: string }) {
  return (
    <div className={`mx-auto ${maxWidth} p-4 sm:p-6 lg:p-8`} aria-busy="true" aria-label="Loading">
      <div className="animate-pulse space-y-4">
        <div className="h-24 rounded-2xl bg-slate-100" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STAT_SKELETON_KEYS.map((key) => (
            <div key={key} className="h-24 rounded-2xl bg-slate-100" />
          ))}
        </div>
        <div className="h-48 rounded-2xl bg-slate-100" />
      </div>
    </div>
  )
}

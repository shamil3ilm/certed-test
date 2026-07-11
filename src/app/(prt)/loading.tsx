/** Shown while a portal page's server component resolves, so navigation never
 *  looks frozen. A neutral skeleton that fits every page's max-width. */
export default function PortalLoading() {
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading">
      <div className="animate-pulse space-y-4">
        <div className="h-24 rounded-2xl bg-slate-100" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-100" />
          ))}
        </div>
        <div className="h-48 rounded-2xl bg-slate-100" />
      </div>
    </div>
  )
}

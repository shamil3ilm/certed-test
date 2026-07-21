'use client'

/** Portal error boundary - keeps a failed read/action inside the branded shell
 *  with a retry, instead of Next's bare error page. */
export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center p-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-500">
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
      </span>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-1 text-sm text-slate-500">This section couldn&apos;t load. Please try again.</p>
      <button onClick={reset} className="btn btn-primary mt-5">Try again</button>
    </main>
  )
}

'use client'

import { AlertTriangle } from 'lucide-react'

/** Portal error boundary - keeps a failed read/action inside the branded shell
 *  with a retry, instead of Next's bare error page. */
export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center p-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-danger-surface text-danger-ink">
        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-1 text-sm text-slate-600">This section couldn&apos;t load. Please try again.</p>
      <button type="button" onClick={reset} className="btn btn-primary mt-5">
        Try again
      </button>
    </main>
  )
}

'use client'

import Link from 'next/link'

/** Error boundary for the public marketing pages - keeps a failed render on-brand
 *  with a retry and a way home, instead of Next's bare error screen. */
export default function MarketingError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-500">
        This page couldn&apos;t load right now. Please try again in a moment.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-10 items-center rounded-lg bg-primary px-5 font-semibold text-white transition hover:bg-primary/90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-5 font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Back home
        </Link>
      </div>
    </main>
  )
}

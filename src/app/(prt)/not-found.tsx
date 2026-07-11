import Link from 'next/link'

/** Branded 404 for notFound() (missing/forbidden ids) with a way back in. */
export default function PortalNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center p-6 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">Not found</h1>
      <p className="mt-1 text-sm text-slate-500">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link href="/dashboard" className="btn btn-primary mt-5">Back to dashboard</Link>
    </main>
  )
}

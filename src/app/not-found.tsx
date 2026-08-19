import Link from 'next/link'
import { connection } from 'next/server'

/**
 * Global 404 for unknown URLs (portal segments use their own (prt)/not-found).
 * `.prt-scope` applies the brand styles instead of a bare Next.js 404.
 *
 * `await connection()` forces dynamic rendering. The app host serves a per-request
 * nonce CSP, and Next only stamps that nonce onto scripts when a page renders per
 * request; statically prerendered, this 404's scripts would ship without the nonce
 * and be CSP-blocked (text shows, no hydration).
 */
export default async function RootNotFound() {
  await connection()
  return (
    <div className="prt-scope min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
        <p className="text-5xl font-bold text-primary">404</p>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">Page not found</h1>
        <p className="mt-1 text-sm text-slate-500">
          This page doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <Link href="/" className="btn btn-primary mt-5">
          Back to Cert-Ed
        </Link>
      </main>
    </div>
  )
}

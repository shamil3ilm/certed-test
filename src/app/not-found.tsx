import Link from 'next/link'
import { connection } from 'next/server'

/**
 * Global 404 for unknown URLs — the app-router root fallback (portal segments use
 * their own (prt)/not-found). Wrapped in `.prt-scope` so the brand button/colour
 * styles apply instead of a bare, unstyled Next.js 404.
 *
 * `await connection()` opts this into dynamic rendering. The app host serves a
 * per-request nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`), and Next
 * only stamps that nonce onto a page's scripts when it renders per-request (see the
 * CSP guide in node_modules/next/dist/docs). Statically prerendered, this 404's
 * framework/chunk scripts ship WITHOUT the nonce, so every one is CSP-blocked - the
 * static text shows but the page never hydrates. Rendering on the connection
 * restores the nonce, matching how every (prt)/* page (force-dynamic) already works.
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

import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { DISPLAY_TZ, isValidTimeZone } from '@/lib/time/format'
import { PortalHeader } from './PortalHeader'
import { PortalProviders } from './Providers'
import { ViewerTimeZoneProvider } from './ViewerTimeZone'
import { IdleLogout } from './IdleLogout'

export const metadata: Metadata = {
  title: 'Cert-Ed Academia - App',
}

// Portal pages are auth-dependent - never statically cache/prerender them
// (otherwise build-time redirects get baked in without a Location header).
export const dynamic = 'force-dynamic'

/** The viewer's timezone for the first server paint: their saved `tz` cookie, else
 *  a geo-IP hint (Vercel edge header), else the institute zone. The client then
 *  confirms + persists the real device zone (see ViewerTimeZoneProvider). */
async function resolveViewerTimeZone(): Promise<string> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const pick = (value?: string | null) => (value && isValidTimeZone(value) ? value : null)
  return pick(cookieStore.get('tz')?.value) ?? pick(headerStore.get('x-vercel-ip-timezone')) ?? DISPLAY_TZ
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewerTz = await resolveViewerTimeZone()
  return (
    <div className="prt-scope flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <ViewerTimeZoneProvider initialTz={viewerTz}>
        <PortalProviders>
          <IdleLogout />
          <PortalHeader />
          <div className="flex-1">{children}</div>
          <footer className="mt-8 border-t border-slate-200">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs leading-relaxed text-slate-600 sm:flex-row">
              <div className="text-center sm:text-left">
                <p className="font-semibold text-slate-600">Cert-Ed Academia</p>
                <p className="mt-0.5">&copy; 2026 Cert-Ed Academia - v1.0.0</p>
              </div>
              <div className="text-center sm:text-right">
                <p>Come, let&apos;s learn together!</p>
                <p className="mt-0.5">hello@certedacademia.com - +91 98765 43210</p>
              </div>
            </div>
          </footer>
        </PortalProviders>
      </ViewerTimeZoneProvider>
    </div>
  )
}

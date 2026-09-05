import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { DISPLAY_TZ, isValidTimeZone } from '@/lib/time/format'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { logError } from '@/lib/observability/log'
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

/** The shipped version, inlined at build from package.json (next.config `env`), so the
 *  footer cannot claim a version the build isn't. */
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION

/** The academy identity for the footer, read from org_settings - the same admin-editable
 *  record that prints on receipts, pay slips and report cards - so the footer cannot drift
 *  from those documents (or from the marketing site) the way the hard-coded pair did. */
async function resolveOrgIdentity(): Promise<{ name: string; contact: string }> {
  try {
    const org = await getOrgSettings()
    return { name: org.institute_name, contact: [org.contact_email, org.contact_phone].filter(Boolean).join(' - ') }
  } catch (error) {
    // This shell wraps the SIGN-IN page too, so the footer must never be the reason a
    // signed-out visitor sees a 500. Fall back to the name every branded surface uses
    // (the org_settings default since 0001) and drop the contact line for this render.
    logError('portal-footer.org-settings', error)
    return { name: 'Cert-Ed Academia', contact: '' }
  }
}

/** The viewer's timezone for the first server paint: their saved `tz` cookie, else
 *  a geo-IP hint (Vercel edge header), else the institute zone. The client then
 *  confirms + persists the real device zone (see ViewerTimeZoneProvider). */
async function resolveViewerTimeZone(): Promise<string> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const pick = (value?: string | null) => (value && isValidTimeZone(value) ? value : null)
  return pick(cookieStore.get('tz')?.value) ?? pick(headerStore.get('x-vercel-ip-timezone')) ?? DISPLAY_TZ
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The academy's identity comes from org_settings - the same admin-editable record that
  // prints on receipts, pay slips and report cards - so the portal footer can never drift
  // from those documents (or from the marketing site) the way hard-coded values did.
  const [viewerTz, org] = await Promise.all([resolveViewerTimeZone(), resolveOrgIdentity()])
  const year = new Date().getFullYear()
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
                <p className="font-semibold text-slate-600">{org.name}</p>
                <p className="mt-0.5">
                  &copy; {year} {org.name}
                  {APP_VERSION ? ` - v${APP_VERSION}` : ''}
                </p>
              </div>
              <div className="text-center sm:text-right">
                <p>Come, let&apos;s learn together!</p>
                {org.contact ? <p className="mt-0.5">{org.contact}</p> : null}
              </div>
            </div>
          </footer>
        </PortalProviders>
      </ViewerTimeZoneProvider>
    </div>
  )
}

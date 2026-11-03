import Link from 'next/link'
import { Bell } from 'lucide-react'
import { getActorContext } from '@/lib/session/actor-context'
import { countUnreadNotifications } from '@/lib/services/notifications'
import { ProfileMenu } from './ProfileMenu'
import { MobileNav } from './MobileNav'
import { NavLinks } from './NavLinks'
import { navFor } from './nav'
import { BrandLogo, personaLabel } from '@/lib/ui'

export async function PortalHeader() {
  const actor = await getActorContext()
  if (actor.accessState !== 'active' || !actor.profile) return null

  const profile = actor.profile
  const links = navFor(actor.capabilities.allowed)
  const label = personaLabel(actor.personas)
  const unread = await countUnreadNotifications(profile.id)

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4">
        {/* Row 1: logo + account (hamburger drawer on small screens). */}
        <div className="flex h-16 items-center justify-between gap-3 md:h-20">
          <div className="flex items-center gap-1">
            <MobileNav links={links} />
            <Link
              href="/dashboard"
              aria-label="Cert-Ed Academia - go to dashboard"
              className="flex shrink-0 items-center"
            >
              <BrandLogo priority />
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-right text-xs leading-tight text-slate-600 sm:block">
              {profile.full_name ?? profile.email}
              <span className="block text-slate-600">{label}</span>
            </span>
            <Link
              href="/notifications"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
              className="relative grid min-h-10 min-w-10 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-primary px-1 text-micro font-semibold leading-none text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
            <ProfileMenu name={profile.full_name ?? profile.email} email={profile.email} roleLabel={label} />
          </div>
        </div>

        {/* Row 2: nav bar under the logo (large screens only). */}
        <NavLinks links={links} />
      </div>
    </header>
  )
}

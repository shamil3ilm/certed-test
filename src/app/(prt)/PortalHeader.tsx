import Link from 'next/link'
import Image from 'next/image'
import { getActorContext } from '@/lib/session/actor-context'
import { countUnreadNotifications } from '@/lib/services/notifications'
import { ProfileMenu } from './ProfileMenu'
import { MobileNav } from './MobileNav'
import { NavLinks } from './NavLinks'
import { navFor } from './nav'
import { personaLabel } from '@/lib/ui'

export async function PortalHeader() {
  const actor = await getActorContext()
  if (actor.accessState !== 'active' || !actor.profile) return null

  const profile = actor.profile
  const links = navFor(actor.capabilities.allowed)
  const label = personaLabel(actor.personas)
  const unread = await countUnreadNotifications(profile.id)

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4">
        {/* Row 1: logo + account (hamburger drawer on small screens). */}
        <div className="flex h-16 items-center justify-between gap-3 md:h-20">
          <div className="flex items-center gap-1">
            <MobileNav links={links} />
            <Link href="/dashboard" className="flex shrink-0 items-center">
              <Image
                src="/cert-ed-academia-online-tuition-logo.webp"
                alt="Cert-Ed Academia"
                width={320}
                height={80}
                className="w-auto object-contain"
                style={{ height: 'clamp(2.25rem, 4.5vw, 3.75rem)' }}
                priority
              />
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-right text-xs leading-tight text-gray-500 sm:block">
              {profile.full_name ?? profile.email}
              <span className="block text-gray-400">{label}</span>
            </span>
            <Link
              href="/notifications"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
              className="relative grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-white">
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

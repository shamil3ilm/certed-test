import Link from 'next/link'
import Image from 'next/image'
import { getProfile } from '@/lib/auth/profile'
import { ProfileMenu } from './ProfileMenu'
import { MobileNav } from './MobileNav'
import { navFor } from './nav'

export async function PortalHeader() {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return null
  const links = navFor(profile.role)

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4">
        {/* Row 1 — logo + account (hamburger drawer on small screens) */}
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
              <span className="block capitalize text-gray-400">{profile.role}</span>
            </span>
            <ProfileMenu
              name={profile.full_name ?? profile.email}
              email={profile.email}
              role={profile.role}
            />
          </div>
        </div>

        {/* Row 2 — nav bar under the logo (large screens only) */}
        <nav className="hidden flex-wrap items-center justify-center gap-1 border-t border-gray-100 py-2 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-primary/5 hover:text-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}

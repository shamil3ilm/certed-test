import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'

type Card = { label: string; href?: string }

export default async function Dashboard() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')

  const cards: Card[] =
    profile.role === 'admin'
      ? [
          { label: 'Users', href: '/admin/users' },
          { label: 'Courses', href: '/admin/courses' },
          { label: 'Resources', href: '/resources' },
          { label: 'Announcements', href: '/announcements' },
          { label: 'Finance' },
        ]
      : profile.role === 'teacher'
        ? [
            { label: 'Announcements', href: '/announcements' },
            { label: 'Resources', href: '/resources' },
            { label: 'Assignments', href: '/assignments' },
          ]
        : [
            { label: 'Announcements', href: '/announcements' },
            { label: 'Resources', href: '/resources' },
            { label: 'Assignments', href: '/assignments' },
            { label: 'Receipts' },
          ]

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">
        Welcome, {profile.full_name ?? profile.email}
      </h1>
      <p className="mt-1 text-slate-500">Role: {profile.role}</p>
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {cards.map((c) =>
          c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="rounded-xl border bg-white p-6 shadow-sm transition hover:shadow"
            >
              {c.label}
            </Link>
          ) : (
            <div key={c.label} className="rounded-xl border bg-white p-6 text-slate-400 shadow-sm">
              {c.label} <span className="text-xs">(soon)</span>
            </div>
          ),
        )}
      </section>
    </main>
  )
}

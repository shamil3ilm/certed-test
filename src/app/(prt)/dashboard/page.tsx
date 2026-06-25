import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'

export default async function Dashboard() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')

  const cards =
    profile.role === 'admin'
      ? ['Users', 'Courses', 'Finance']
      : profile.role === 'teacher'
        ? ['Announcements', 'Resources', 'Assignments']
        : ['Announcements', 'Assignments', 'Receipts']

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">
        Welcome, {profile.full_name ?? profile.email}
      </h1>
      <p className="mt-1 text-slate-500">Role: {profile.role}</p>
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c} className="rounded-xl border bg-white p-6 shadow-sm">
            {c}
          </div>
        ))}
      </section>
    </main>
  )
}

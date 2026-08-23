import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { Card, PageHeader, SectionLabel } from '@/lib/ui'
import { getMessagingMatrixRecord } from '@/lib/services/messaging/matrix-config'
import { MessagingMatrixForm } from './MessagingMatrixForm'

/** Admin access hub: per-user capability editing lives in the Users flow (open to
 *  sub_admins too), while the academy-wide messaging matrix is ADMIN-only - it writes
 *  org_settings, which the DB restricts to admins, so only admins see/edit it here. */
export default async function AdminAccessManagementPage() {
  const me = await requireCapability('manageUsers')
  const { isAdmin } = await loadPersonaFlags(me.id)
  const enabled = isAdmin ? await getMessagingMatrixRecord() : {}

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Access management"
        description="Manage both per-user capability overrides and academy-wide messaging rules."
      />

      <section className="space-y-3">
        <SectionLabel>User capabilities</SectionLabel>
        <Card className="p-4">
          <p className="text-sm text-slate-600">
            Per-user permission overrides are managed from the Users hub. Open a user and choose their permissions page
            to grant or revoke global capabilities such as finance, history, calendar, or grading access.
          </p>
          <div className="mt-3">
            <Link href="/admin/users" className="btn btn-sm btn-soft">
              Open users
            </Link>
          </div>
        </Card>
      </section>

      {isAdmin && (
        <section className="mt-8 space-y-3">
          <SectionLabel>Messaging rules</SectionLabel>
          <p className="text-sm text-slate-500">
            Everyone can always message their <span className="font-medium text-slate-700">direct contacts</span> -
            students and their class tutors, and mentors with their mentees and those mentees&apos; tutors. Tick a pair
            below to <span className="font-medium text-slate-700">additionally</span> let everyone of one role message
            everyone of another across the whole academy. All pairs are off by default.
          </p>
          <MessagingMatrixForm initialEnabled={enabled} />
        </section>
      )}
    </main>
  )
}

import { requireCapability } from '@/lib/auth/require-role'
import { PageHeader } from '@/lib/ui'
import { getMessagingMatrixRecord } from '@/lib/services/messaging/matrix-config'
import { MessagingMatrixForm } from './MessagingMatrixForm'

/** Admin-tier (manageUsers) page to widen messaging beyond direct contacts. */
export default async function AdminMessagingPage() {
  await requireCapability('manageUsers')
  const enabled = await getMessagingMatrixRecord()

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Messaging access" description="Who can start a conversation with whom." />
      <p className="mt-3 text-sm text-slate-500">
        Everyone can always message their <span className="font-medium text-slate-700">direct contacts</span> - students
        and their class tutors, and mentors with their mentees and those mentees&apos; tutors. Tick a pair below to{' '}
        <span className="font-medium text-slate-700">additionally</span> let everyone of one role message everyone of
        another across the whole academy. All pairs are off by default.
      </p>
      <div className="mt-5">
        <MessagingMatrixForm initialEnabled={enabled} />
      </div>
    </main>
  )
}

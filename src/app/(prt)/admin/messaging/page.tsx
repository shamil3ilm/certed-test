import { requireCapability } from '@/lib/auth/require-role'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { PageHeader, SectionLabel } from '@/lib/ui'
import { getMessagingMatrixRecord } from '@/lib/services/messaging/matrix-config'
import { MessagingMatrixForm } from './MessagingMatrixForm'

/**
 * Academy communication rules: controls which personas may send direct messages
 * to which other personas across the institute.
 */
export default async function AdminMessagingRulesPage() {
  const me = await requireCapability('manageUsers')
  const { isAdmin } = await loadPersonaFlags(me.id)
  const enabled = await getMessagingMatrixRecord()

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Messaging rules"
        description="Academy communication rules controlling which roles can message each other across the institution."
      />

      <section className="space-y-3">
        <SectionLabel>Communication matrix</SectionLabel>
        <p className="text-sm text-slate-600">
          Everyone can always message their <span className="font-medium text-slate-700">direct contacts</span> -
          students with their class tutors and mentors, tutors with their students and those students&apos; mentors, and
          mentors with their mentees, those mentees&apos; tutors and the admin team. Tick a pair below to{' '}
          <span className="font-medium text-slate-700">additionally</span> let everyone of one role message everyone of
          another across the whole academy. Students and tutors never message admins directly: they go through their
          mentor, so those pairs cannot be turned on.
        </p>
        <MessagingMatrixForm initialEnabled={enabled} readOnly={!isAdmin} />
      </section>
    </main>
  )
}

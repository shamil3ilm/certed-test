import { requireCapability } from '@/lib/auth/require-role'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { PageHeader } from '@/lib/ui'
import { OrgSettingsForm } from './OrgSettingsForm'

/** Admin Organization settings: the institute identity, bank and signatory details
 *  that print on receipts, pay slips and report cards - editable in-app instead of
 *  only in the database. base_currency, timezone and the messaging matrix keep their
 *  own dedicated flows and are not edited here. */
export default async function OrgSettingsPage() {
  await requireCapability('manageUsers')
  const org = await getOrgSettings()

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Organization settings"
        description="Your academy's identity, bank and signatory details. These print on receipts, pay slips and report cards."
      />
      <OrgSettingsForm org={org} />
    </main>
  )
}

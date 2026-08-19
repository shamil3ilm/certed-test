'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { OrgSettings } from '@/lib/services/finance/org-settings'
import { Field, Input, Textarea } from '../../form'
import { assertActionOk } from '../../action-client'
import { useUI } from '../../Providers'
import { saveOrgProfileAction } from './actions'

/** Edits the institute-profile fields on the single org_settings row. Uncontrolled
 *  (defaultValue) inputs submitted as a plain FormData, matching the field names the
 *  action reads. */
export function OrgSettingsForm({ org }: { org: OrgSettings }) {
  const router = useRouter()
  const { toast } = useUI()
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const formData = new FormData(event.currentTarget)
    try {
      assertActionOk(await saveOrgProfileAction(formData), 'Could not save settings')
      toast('Organization settings saved', 'success')
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save settings', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Identity</h2>
        <Field label="Institute name">
          <Input name="institute_name" defaultValue={org.institute_name} required maxLength={200} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact email">
            <Input name="contact_email" type="email" defaultValue={org.contact_email ?? ''} maxLength={200} />
          </Field>
          <Field label="Contact phone">
            <Input name="contact_phone" defaultValue={org.contact_phone ?? ''} maxLength={50} />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Bank details (printed on receipts)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bank account">
            <Input name="bank_account" defaultValue={org.bank_account ?? ''} maxLength={100} />
          </Field>
          <Field label="IFSC">
            <Input name="bank_ifsc" defaultValue={org.bank_ifsc ?? ''} maxLength={50} />
          </Field>
        </div>
        <Field label="Branch">
          <Input name="bank_branch" defaultValue={org.bank_branch ?? ''} maxLength={120} />
        </Field>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Signatory</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Signatory name">
            <Input name="signatory_name" defaultValue={org.signatory_name ?? ''} maxLength={120} />
          </Field>
          <Field label="Signatory title">
            <Input name="signatory_title" defaultValue={org.signatory_title ?? ''} maxLength={120} />
          </Field>
        </div>
        <Field label="Signature text" hint="Printed as the signature line, e.g. 'Digitally signed'.">
          <Input name="signature_text" defaultValue={org.signature_text ?? ''} maxLength={120} />
        </Field>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Documents</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Receipt number prefix">
            <Input name="receipt_prefix" defaultValue={org.receipt_prefix} required maxLength={20} />
          </Field>
          <Field label="Pay slip number prefix">
            <Input name="payslip_prefix" defaultValue={org.payslip_prefix} required maxLength={20} />
          </Field>
        </div>
        <Field label="Terms text" hint="Printed at the foot of receipts.">
          <Textarea name="terms_text" defaultValue={org.terms_text ?? ''} rows={2} maxLength={2000} />
        </Field>
      </section>

      <button type="submit" disabled={busy} className="btn btn-primary">
        {busy ? 'Saving...' : 'Save settings'}
      </button>
    </form>
  )
}

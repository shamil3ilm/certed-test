import { createClient } from '@/lib/supabase/server'

export type OrgSettings = {
  institute_name: string
  contact_email: string | null
  contact_phone: string | null
  bank_account: string | null
  bank_ifsc: string | null
  bank_branch: string | null
  terms_text: string | null
  signatory_name: string | null
  signatory_title: string | null
  signature_mode: 'text' | 'image'
  signature_text: string | null
  default_currency: string
  timezone: string
  receipt_prefix: string
  payslip_prefix: string
}

export async function getOrgSettings(): Promise<OrgSettings> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('org_settings').select('*').single()
  if (error) throw new Error(`org_settings: ${error.message}`)
  return data as OrgSettings
}

/** Formats a sequential document number, e.g. receiptNumber('CEA-R', 2026, 7) -> 'CEA-R-2026-0007'. */
export function receiptNumber(prefix: string, year: number, n: number): string {
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`
}

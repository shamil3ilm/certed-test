import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type Receipt = {
  id: string
  number: string
  student_id: string | null
  student_name_snapshot: string
  class_snapshot: string | null
  issue_date: string
  currency: string
  note: string | null
  subtotal: number
  discount: number | null
  total: number
  drive_file_id: string | null
  drive_link: string | null
  voided: boolean
  created_by: string | null
  created_at: string
}

export type ReceiptLineInput = { subject: string; hours: number; rate: number; amount: number }

export async function listMyReceipts(studentId: string): Promise<Receipt[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`receipts.listMine: ${error.message}`)
  return (data ?? []) as Receipt[]
}

export async function listAllReceipts(): Promise<Receipt[]> {
  const supabase = await createClient() // admin session; RLS lets admin read all
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`receipts.listAll: ${error.message}`)
  return (data ?? []) as Receipt[]
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const supabase = await createClient() // RLS: own or admin
  const { data } = await supabase.from('receipts').select('*').eq('id', id).maybeSingle()
  return (data as Receipt) ?? null
}

/** Inserts the receipt + its lines (admin-only issuance, via service-role). */
export async function insertReceipt(
  record: Omit<Receipt, 'id' | 'created_at'>,
  lines: ReceiptLineInput[],
): Promise<Receipt> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('receipts').insert(record).select('*').single()
  if (error) throw new Error(`receipts.insert: ${error.message}`)
  const receipt = data as Receipt
  if (lines.length) {
    const { error: le } = await admin
      .from('receipt_lines')
      .insert(lines.map((l) => ({ ...l, receipt_id: receipt.id })))
    if (le) throw new Error(`receipt_lines.insert: ${le.message}`)
  }
  return receipt
}

export async function setReceiptDrive(
  id: string,
  drive_file_id: string,
  drive_link: string | null,
): Promise<void> {
  const admin = createAdminClient()
  await admin.from('receipts').update({ drive_file_id, drive_link }).eq('id', id)
}

export async function voidReceipt(id: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('receipts').update({ voided: true }).eq('id', id)
  if (error) throw new Error(`receipts.void: ${error.message}`)
}

/** Last rate charged to this student for a subject (newest receipt wins) — prefill helper. */
export async function lastRateForStudent(studentId: string, subject: string): Promise<number | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('receipts')
    .select('created_at, receipt_lines(subject, rate)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(10)
  for (const r of (data ?? []) as { receipt_lines: { subject: string; rate: number }[] }[]) {
    const match = r.receipt_lines?.find((l) => l.subject === subject)
    if (match) return match.rate
  }
  return null
}

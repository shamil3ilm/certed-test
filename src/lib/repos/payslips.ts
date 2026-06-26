import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type Payslip = {
  id: string
  number: string
  teacher_id: string | null
  teacher_name_snapshot: string
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

export type PayslipLineInput = { label: string; hours: number; rate: number; amount: number }

export async function listMyPayslips(teacherId: string): Promise<Payslip[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payslips')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`payslips.listMine: ${error.message}`)
  return (data ?? []) as Payslip[]
}

export async function listAllPayslips(): Promise<Payslip[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payslips')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`payslips.listAll: ${error.message}`)
  return (data ?? []) as Payslip[]
}

export async function getPayslip(id: string): Promise<Payslip | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('payslips').select('*').eq('id', id).maybeSingle()
  return (data as Payslip) ?? null
}

export async function insertPayslip(
  record: Omit<Payslip, 'id' | 'created_at'>,
  lines: PayslipLineInput[],
): Promise<Payslip> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('payslips').insert(record).select('*').single()
  if (error) throw new Error(`payslips.insert: ${error.message}`)
  const payslip = data as Payslip
  if (lines.length) {
    const { error: le } = await admin
      .from('payslip_lines')
      .insert(lines.map((l) => ({ ...l, payslip_id: payslip.id })))
    if (le) throw new Error(`payslip_lines.insert: ${le.message}`)
  }
  return payslip
}

export async function setPayslipDrive(
  id: string,
  drive_file_id: string,
  drive_link: string | null,
): Promise<void> {
  const admin = createAdminClient()
  await admin.from('payslips').update({ drive_file_id, drive_link }).eq('id', id)
}

export async function voidPayslip(id: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('payslips').update({ voided: true }).eq('id', id)
  if (error) throw new Error(`payslips.void: ${error.message}`)
}

export async function lastRateForTeacher(teacherId: string, label: string): Promise<number | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('payslips')
    .select('created_at, payslip_lines(label, rate)')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(10)
  for (const p of (data ?? []) as { payslip_lines: { label: string; rate: number }[] }[]) {
    const match = p.payslip_lines?.find((l) => l.label === label)
    if (match) return match.rate
  }
  return null
}

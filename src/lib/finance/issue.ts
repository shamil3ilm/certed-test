import 'server-only'
import { lineAmount, computeTotals } from '@/lib/money'
import { getOrgSettings, type OrgSettings } from '@/lib/repos/orgSettings'
import { allocateNumber } from '@/lib/repos/documentCounters'
import { getProfileById } from '@/lib/repos/users'
import { insertReceipt, setReceiptDrive } from '@/lib/repos/receipts'
import { insertPayslip, setPayslipDrive } from '@/lib/repos/payslips'
import { buildReceiptHtml, buildPayslipHtml, type OrgInfo } from '@/lib/pdf/template'
import { brandAssets } from '@/lib/pdf/brandAssets'
import { htmlToPdf } from '@/lib/pdf/renderPdf'
import { resolveFinanceFolder } from '@/lib/drive/financeFolder'
import { uploadBuffer } from '@/lib/drive/upload'
import { writeAudit } from '@/lib/repos/audit'
import type { IssueReceiptInput, IssuePayslipInput } from '@/lib/validation/finance'

function orgInfo(org: OrgSettings): OrgInfo {
  return {
    instituteName: org.institute_name,
    email: org.contact_email,
    phone: org.contact_phone,
    bankAccount: org.bank_account,
    bankIfsc: org.bank_ifsc,
    bankBranch: org.bank_branch,
    terms: org.terms_text,
    signatoryName: org.signatory_name,
    signatoryTitle: org.signatory_title,
    signatureText: org.signature_text ?? 'Digitally signed by',
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** validate → totals → allocate number → insert → render PDF → upload to Drive → audit. */
export async function issueReceipt(
  input: IssueReceiptInput,
  actorId: string,
): Promise<{ id: string; number: string }> {
  const student = await getProfileById(input.student_id)
  if (!student) throw new Error('student not found')
  const lines = input.lines.map((l) => ({ ...l, amount: lineAmount(l.hours, l.rate) }))
  const { subtotal, total } = computeTotals(input.lines, input.discount ?? 0)
  const org = await getOrgSettings()
  const year = new Date(input.issue_date).getFullYear()
  const number = await allocateNumber('receipt', org.receipt_prefix, year)

  const receipt = await insertReceipt(
    {
      number,
      student_id: student.id,
      student_name_snapshot: student.full_name ?? student.email,
      class_snapshot: student.class_level,
      issue_date: input.issue_date,
      currency: input.currency,
      note: input.note ?? null,
      subtotal,
      discount: input.discount ?? null,
      total,
      drive_file_id: null,
      drive_link: null,
      voided: false,
      created_by: actorId,
    },
    lines.map((l) => ({ subject: l.subject, hours: l.hours, rate: l.rate, amount: l.amount })),
  )

  const html = buildReceiptHtml(
    {
      number,
      issueDate: fmtDate(input.issue_date),
      partyName: receipt.student_name_snapshot,
      classLevel: receipt.class_snapshot,
      currency: receipt.currency,
      lines: lines.map((l) => ({ label: l.subject, hours: l.hours, rate: l.rate, amount: l.amount })),
      subtotal,
      discount: receipt.discount,
      total,
      note: receipt.note,
    },
    orgInfo(org),
    brandAssets(),
  )
  const pdf = await htmlToPdf(html)
  const folder = await resolveFinanceFolder('Receipts')
  const { fileId, link } = await uploadBuffer(folder, `${number}.pdf`, 'application/pdf', pdf)
  await setReceiptDrive(receipt.id, fileId, link)
  await writeAudit({ actor_id: actorId, action: 'receipt.issue', entity_type: 'receipt', entity_id: receipt.id })
  return { id: receipt.id, number }
}

export async function issuePayslip(
  input: IssuePayslipInput,
  actorId: string,
): Promise<{ id: string; number: string }> {
  const teacher = await getProfileById(input.teacher_id)
  if (!teacher) throw new Error('teacher not found')
  const lines = input.lines.map((l) => ({ ...l, amount: lineAmount(l.hours, l.rate) }))
  const { subtotal, total } = computeTotals(input.lines, input.discount ?? 0)
  const org = await getOrgSettings()
  const year = new Date(input.issue_date).getFullYear()
  const number = await allocateNumber('payslip', org.payslip_prefix, year)

  const payslip = await insertPayslip(
    {
      number,
      teacher_id: teacher.id,
      teacher_name_snapshot: teacher.full_name ?? teacher.email,
      issue_date: input.issue_date,
      currency: input.currency,
      note: input.note ?? null,
      subtotal,
      discount: input.discount ?? null,
      total,
      drive_file_id: null,
      drive_link: null,
      voided: false,
      created_by: actorId,
    },
    lines.map((l) => ({ label: l.subject, hours: l.hours, rate: l.rate, amount: l.amount })),
  )

  const html = buildPayslipHtml(
    {
      number,
      issueDate: fmtDate(input.issue_date),
      partyName: payslip.teacher_name_snapshot,
      currency: payslip.currency,
      lines: lines.map((l) => ({ label: l.subject, hours: l.hours, rate: l.rate, amount: l.amount })),
      subtotal,
      discount: payslip.discount,
      total,
      note: payslip.note,
    },
    orgInfo(org),
    brandAssets(),
  )
  const pdf = await htmlToPdf(html)
  const folder = await resolveFinanceFolder('Pay Slips')
  const { fileId, link } = await uploadBuffer(folder, `${number}.pdf`, 'application/pdf', pdf)
  await setPayslipDrive(payslip.id, fileId, link)
  await writeAudit({ actor_id: actorId, action: 'payslip.issue', entity_type: 'payslip', entity_id: payslip.id })
  return { id: payslip.id, number }
}

'use server'
import { requireRole } from '@/lib/auth/require-role'
import { hasCapability, isAdminTier } from '@/lib/capabilities'
import { listProfiles } from '@/lib/services/users'
import { listClasses } from '@/lib/services/classes'
import { countEnrollmentsPerClass } from '@/lib/services/enrollments'
import { financeTotals, listRecentDocs } from '@/lib/services/finance/finance-docs'
import { formatMoney, formatMoneyTotals } from '@/lib/money'

/**
 * On-demand content for the Admin/Sub Admin dashboard stat-card modals. These
 * lists can grow with the whole academy (every student, every tutor, every
 * class), so they're fetched only when the modal is actually opened —
 * StatModalCard's `load` prop — instead of on every dashboard page load.
 * Each action re-checks the role itself; the dashboard page's own
 * `requireRole` gate only proves you're SOME active role, not that you're
 * allowed to see academy-wide people/class data.
 */

export async function loadStudentsModal() {
  const me = await requireRole(['admin', 'sub_admin'])
  if (!hasCapability(me, 'manageUsers')) throw new Error('forbidden')
  const profiles = await listProfiles()
  const students = profiles.filter((p) => p.role === 'student')
  return { items: students.map((p) => ({ primary: p.full_name ?? p.email, secondary: p.class_level ?? p.email })) }
}

export async function loadTutorsModal() {
  const me = await requireRole(['admin', 'sub_admin'])
  if (!hasCapability(me, 'manageUsers')) throw new Error('forbidden')
  const profiles = await listProfiles()
  const tutors = profiles.filter((p) => p.role === 'tutor')
  return { items: tutors.map((p) => ({ primary: p.full_name ?? p.email, secondary: p.email })) }
}

export async function loadPendingModal() {
  const me = await requireRole(['admin', 'sub_admin'])
  if (!hasCapability(me, 'manageUsers')) throw new Error('forbidden')
  const profiles = await listProfiles()
  const pending = profiles.filter((p) => p.status === 'pending')
  return { items: pending.map((p) => ({ primary: p.full_name ?? p.email, secondary: p.email })) }
}

export async function loadActiveClassesModal() {
  const me = await requireRole(['admin'])
  if (!isAdminTier(me)) throw new Error('forbidden')
  const [classes, enrollCounts] = await Promise.all([listClasses(), countEnrollmentsPerClass()])
  const active = classes.filter((c) => c.status === 'active')
  return {
    items: active.map((c) => ({
      primary: c.name,
      secondary: `${enrollCounts.get(c.id) ?? 0} students`,
      href: `/classroom/${c.id}`,
    })),
  }
}

export async function loadFinanceModal() {
  const me = await requireRole(['admin'])
  if (!hasCapability(me, 'viewFinance')) throw new Error('forbidden')
  const [receiptTotals, payslipTotals, recentReceipts, recentPayslips] = await Promise.all([
    financeTotals('receipt'),
    financeTotals('payslip'),
    listRecentDocs('receipt', 100),
    listRecentDocs('payslip', 100),
  ])
  const liveReceipts = recentReceipts.filter((r) => !r.voided)
  const livePayslips = recentPayslips.filter((p) => !p.voided)
  return {
    sections: [
      {
        heading: 'Revenue · receipts',
        total: formatMoneyTotals(receiptTotals),
        items: liveReceipts.map((r) => ({ primary: r.number, secondary: formatMoney(Number(r.total), r.currency) })),
      },
      {
        heading: 'Payouts · pay slips',
        total: formatMoneyTotals(payslipTotals),
        items: livePayslips.map((p) => ({ primary: p.number, secondary: formatMoney(Number(p.total), p.currency) })),
      },
    ],
  }
}

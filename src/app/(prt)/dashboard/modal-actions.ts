'use server'
import { requireCapability } from '@/lib/auth/require-role'
import { listProfiles } from '@/lib/services/users'
import { listClasses } from '@/lib/services/classes'
import { countEnrollmentsPerClass } from '@/lib/services/enrollments'
import { financeTotals, listRecentDocs } from '@/lib/services/finance/finance-docs'
import { formatMoney, formatMoneyTotals } from '@/lib/money'

/**
 * On-demand content for the Admin/Sub Admin dashboard stat-card modals. These
 * lists can grow with the whole academy (every student, every tutor, every
 * class), so they're fetched only when the modal is actually opened -
 * StatModalCard's `load` prop - instead of on every dashboard page load.
 *
 * Each loader re-asserts its specific CAPABILITY via requireCapability, which
 * decides against the actor's RESOLVED capabilities (persona baseline + admin
 * overrides) - the same guard the pages and nav use, so an override is honoured
 * here too. The dashboard page's own `viewDashboard` gate only proves you can
 * see a dashboard, not that you may read academy-wide people/class/finance data;
 * a caller lacking the capability is redirected rather than shown partial data.
 */

export async function loadStudentsModal() {
  // Read-only stat-card listing: gate on viewUsers, not manageUsers, so a
  // viewUsers-only grantee (via override) can load the tile it's shown.
  await requireCapability('viewUsers')
  const profiles = await listProfiles()
  const students = profiles.filter((p) => p.role === 'student')
  return { items: students.map((p) => ({ primary: p.full_name ?? p.email, secondary: p.class_level ?? p.email })) }
}

export async function loadTutorsModal() {
  await requireCapability('viewUsers')
  const profiles = await listProfiles()
  // Mentor is a first-class staff role - listing only role='tutor' hid dedicated
  // mentors from the admin's staff modal while the stat card counted them.
  const staff = profiles.filter((p) => p.role === 'tutor' || p.role === 'mentor')
  return {
    items: staff.map((p) => ({
      primary: p.full_name ?? p.email,
      secondary: p.role === 'mentor' ? `Mentor - ${p.email}` : p.email,
    })),
  }
}

export async function loadPendingModal() {
  await requireCapability('viewUsers')
  const profiles = await listProfiles()
  const pending = profiles.filter((p) => p.status === 'pending')
  return { items: pending.map((p) => ({ primary: p.full_name ?? p.email, secondary: p.email })) }
}

export async function loadActiveClassesModal() {
  // manageAdminTier is the admin-tier marker (a hard rule, never override-granted),
  // preserving this modal's admin-only reach exactly as the prior isAdminTier check.
  await requireCapability('manageAdminTier')
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
  await requireCapability('viewFinance')
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
        heading: 'Revenue - receipts',
        total: formatMoneyTotals(receiptTotals),
        items: liveReceipts.map((r) => ({ primary: r.number, secondary: formatMoney(Number(r.total), r.currency) })),
      },
      {
        heading: 'Payouts - pay slips',
        total: formatMoneyTotals(payslipTotals),
        items: livePayslips.map((p) => ({ primary: p.number, secondary: formatMoney(Number(p.total), p.currency) })),
      },
    ],
  }
}

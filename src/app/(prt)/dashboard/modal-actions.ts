'use server'
import { requireCapability } from '@/lib/auth/require-role'
import { activeTeachingProfileIds, activeMentorProfileIds } from '@/lib/services/class-tutors'
import { financeUrl } from '@/lib/services/finance/admin-finance'
import { usersUrl } from '@/lib/services/page-data/admin-users'
import { listProfilesByFilter } from '@/lib/services/users'
import { listClasses } from '@/lib/services/classes'
import { countEnrollmentsPerClass } from '@/lib/services/enrollments'
import { financeTotalsBase, listRecentDocs } from '@/lib/services/finance/finance-docs'
import { formatMoney, EMPTY_MONEY } from '@/lib/money'
import { staffRoleLabel } from '@/lib/ui'

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
  const students = await listProfilesByFilter({ role: 'student', status: 'active' })
  return {
    items: students.map((p) => ({
      primary: p.full_name ?? p.email,
      secondary: p.class_level ?? p.email,
      href: `/students/${p.id}`,
    })),
  }
}

export async function loadTutorsModal() {
  await requireCapability('viewUsers')
  const staff = await listProfilesByFilter({ role: ['tutor', 'mentor'], status: 'active' })
  const ids = staff.map((profile) => profile.id)
  const [teachingStaffIds, mentoringStaffIds] = await Promise.all([
    activeTeachingProfileIds(ids).then((r) => new Set(r)),
    activeMentorProfileIds(ids).then((r) => new Set(r)),
  ])
  return {
    items: staff.map((p) => ({
      primary: p.full_name ?? p.email,
      secondary: `${staffRoleLabel({ role: p.role, teaches: teachingStaffIds.has(p.id), mentors: mentoringStaffIds.has(p.id) })} - ${p.email}`,
      href: usersUrl({ tab: 'people', role: 'staff', q: p.email }),
    })),
  }
}

export async function loadPendingModal() {
  await requireCapability('viewUsers')
  const pending = await listProfilesByFilter({ status: 'pending' })
  return {
    items: pending.map((p) => ({
      primary: p.full_name ?? p.email,
      secondary: p.email,
      href: usersUrl({ tab: 'people', status: 'pending', q: p.email }),
    })),
  }
}

export async function loadActiveClassesModal() {
  // manageAdminTier is the admin-tier marker (a hard rule, never override-granted),
  // so this modal stays admin-only.
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
  const [receiptBase, payslipBase, recentReceipts, recentPayslips] = await Promise.all([
    financeTotalsBase('receipt'),
    financeTotalsBase('payslip'),
    listRecentDocs('receipt', 100),
    listRecentDocs('payslip', 100),
  ])
  const liveReceipts = recentReceipts.filter((r) => !r.voided)
  const livePayslips = recentPayslips.filter((p) => !p.voided)
  const base = receiptBase.base_currency || payslipBase.base_currency || 'INR'
  const receiptDocs = receiptBase.converted_count + receiptBase.unconverted_count
  const payslipDocs = payslipBase.converted_count + payslipBase.unconverted_count
  // Nothing issued reads as "-" rather than a hard zero, like the dashboard card.
  const headline = (total: number, docs: number) => (docs > 0 ? formatMoney(total, base) : EMPTY_MONEY)
  // A per-document line shows its own currency, plus the base equivalent when it
  // differs and has been converted.
  const secondary = (total: number, currency: string, baseTotal: number | null, baseCurrency: string | null) =>
    baseTotal != null && baseCurrency && baseCurrency !== currency
      ? `${formatMoney(total, currency)} ≈ ${formatMoney(baseTotal, baseCurrency)}`
      : formatMoney(total, currency)
  return {
    sections: [
      {
        // Net headline in the base currency, matching the dashboard card.
        heading: 'Net - revenue minus payouts',
        total: headline(receiptBase.base_total - payslipBase.base_total, receiptDocs + payslipDocs),
        items: [],
      },
      {
        heading: 'Revenue - receipts',
        total: headline(receiptBase.base_total, receiptDocs),
        items: liveReceipts.map((r) => ({
          primary: r.number,
          secondary: secondary(Number(r.total), r.currency, r.base_total, r.base_currency),
          href: financeUrl('receipts', { page: 1, q: r.number }, { page: 1 }),
        })),
      },
      {
        heading: 'Payouts - pay slips',
        total: headline(payslipBase.base_total, payslipDocs),
        items: livePayslips.map((p) => ({
          primary: p.number,
          secondary: secondary(Number(p.total), p.currency, p.base_total, p.base_currency),
          href: financeUrl('payslips', { page: 1, q: p.number }, { page: 1 }),
        })),
      },
    ],
  }
}

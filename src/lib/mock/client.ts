import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { table, persist } from './store'
import { MockQueryBuilder } from './query-builder'
import { getMockUidFromStore } from './session'
import { receiptNumber } from '@/lib/services/finance/org-settings'

type Args = Record<string, unknown>

function profileByUid(uid: string | null): Record<string, unknown> | null {
  if (!uid) return null
  return table('profiles').find((p) => p.auth_user_id === uid) ?? null
}

async function rpc(uid: string | null, fn: string, args: Args) {
  if (fn === 'next_document_number') {
    const counters = table('document_counters')
    let row = counters.find((c) => c.doc_type === args.p_doc_type && c.year === args.p_year)
    if (!row) {
      row = { doc_type: args.p_doc_type, year: args.p_year, last_number: 0 }
      counters.push(row)
    }
    row.last_number = (row.last_number as number) + 1
    persist()
    return { data: row.last_number as number, error: null }
  }
  if (fn === 'teaches_class' || fn === 'is_enrolled') {
    const me = profileByUid(uid)
    if (!me) return { data: false, error: null }
    const tbl = fn === 'teaches_class' ? table('class_tutors') : table('enrollments')
    const idCol = fn === 'teaches_class' ? 'tutor_id' : 'student_id'
    const found = tbl.some((r) => r[idCol] === me.id && r.class_id === args.p_class_id)
    return { data: found, error: null }
  }
  if (fn === 'finance_totals') {
    const rows = table(args.p_kind === 'receipt' ? 'receipts' : 'payslips')
    const byCur = new Map<string, { currency: string; live_total: number; live_count: number }>()
    for (const r of rows) {
      if (r.voided) continue
      const cur = String(r.currency)
      const e = byCur.get(cur) ?? { currency: cur, live_total: 0, live_count: 0 }
      e.live_total += Number(r.total)
      e.live_count += 1
      byCur.set(cur, e)
    }
    return { data: [...byCur.values()], error: null }
  }
  if (fn === 'replace_own_submission') {
    const me = profileByUid(uid)
    if (!me || me.status !== 'active') {
      return { data: null, error: { message: 'actor_not_active' } }
    }
    const assignments = table('assignments')
    const assignment = assignments.find((row) => row.id === args.p_assignment_id && row.status === 'active')
    if (!assignment) {
      return { data: null, error: { message: 'assignment_not_found' } }
    }
    const enrolled = table('enrollments').some(
      (row) => row.class_id === assignment.class_id && row.student_id === me.id,
    )
    if (!enrolled) {
      return { data: null, error: { message: 'not_enrolled' } }
    }

    const submissions = table('submissions')
    const current = submissions.find(
      (row) => row.assignment_id === args.p_assignment_id && row.student_id === me.id && row.is_active === true,
    )
    if (current && current.score != null) {
      return { data: null, error: { message: 'submission_already_graded' } }
    }
    submissions.forEach((row) => {
      if (row.assignment_id === args.p_assignment_id && row.student_id === me.id && row.is_active === true) {
        row.is_active = false
      }
    })

    const now = new Date().toISOString()
    const next = {
      id: randomUUID(),
      assignment_id: args.p_assignment_id,
      student_id: me.id,
      drive_link: args.p_drive_link ?? null,
      file_name: args.p_file_name ?? null,
      status: assignment.due_date != null && String(now) > String(assignment.due_date) ? 'late' : 'submitted',
      score: null,
      feedback: null,
      graded_at: null,
      graded_by: null,
      submitted_at: now,
      is_active: true,
      created_at: now,
    }
    submissions.push(next)
    persist()
    return { data: next, error: null }
  }
  if (fn === 'issue_receipt_doc' || fn === 'issue_payslip_doc') {
    const docType = fn === 'issue_receipt_doc' ? 'receipt' : 'payslip'
    const year = new Date(String(args.p_issue_date)).getFullYear()
    const counters = table('document_counters')
    let counter = counters.find((row) => row.doc_type === docType && row.year === year)
    if (!counter) {
      counter = { doc_type: docType, year, last_number: 0 }
      counters.push(counter)
    }
    counter.last_number = Number(counter.last_number) + 1

    const number = receiptNumber(String(args.p_prefix), year, Number(counter.last_number))
    const now = new Date().toISOString()
    const tableName = docType === 'receipt' ? 'receipts' : 'payslips'
    const lineTableName = docType === 'receipt' ? 'receipt_lines' : 'payslip_lines'
    const lineLabelKey = docType === 'receipt' ? 'subject' : 'label'
    const fkKey = docType === 'receipt' ? 'receipt_id' : 'payslip_id'
    const created = {
      id: randomUUID(),
      number,
      issue_date: String(args.p_issue_date),
      currency: String(args.p_currency),
      note: args.p_note ?? null,
      subtotal: Number(args.p_subtotal),
      discount: args.p_discount == null ? null : Number(args.p_discount),
      total: Number(args.p_total),
      voided: false,
      created_by: args.p_created_by ?? null,
      created_at: now,
      ...(docType === 'receipt'
        ? {
            student_id: args.p_party_id,
            student_name_snapshot: args.p_party_name,
            class_snapshot: args.p_class_level ?? null,
          }
        : {
            tutor_id: args.p_party_id,
            tutor_name_snapshot: args.p_party_name,
          }),
    }
    table(tableName).push(created)

    const rawLines = Array.isArray(args.p_lines) ? args.p_lines : []
    const lineRows = rawLines.map((line) => ({
      id: randomUUID(),
      [fkKey]: created.id,
      [lineLabelKey]: (line as Record<string, unknown>).label,
      hours: (line as Record<string, unknown>).hours,
      rate: (line as Record<string, unknown>).rate,
      amount: (line as Record<string, unknown>).amount,
    }))
    table(lineTableName).push(...lineRows)
    persist()
    return { data: created, error: null }
  }
  return { data: null, error: { message: `mock rpc not implemented: ${fn}` } }
}

/** Builds a fake SupabaseClient over the in-memory store, acting as user `uid`. */
export function createMockClient(uid: string | null): SupabaseClient {
  const me = profileByUid(uid)
  const client = {
    from: (name: string) => new MockQueryBuilder(table(name), name),
    rpc: (fn: string, args: Args = {}) => rpc(uid, fn, args),
    auth: {
      getUser: async () => ({ data: { user: me ? { id: uid, email: me.email } : null }, error: null }),
      // OAuth paths are bypassed by the dev login in mock mode; provide harmless no-ops.
      exchangeCodeForSession: async () => ({ data: { user: null, session: null }, error: null }),
      signInWithOAuth: async () => ({ data: { provider: 'google', url: '/login' }, error: null }),
    },
  }
  return client as unknown as SupabaseClient
}

/** Server (RLS-equivalent) client: identity comes from the dev-login cookie. */
export async function createMockServerClient(): Promise<SupabaseClient> {
  const uid = await getMockUidFromStore()
  return createMockClient(uid)
}

/** Admin/service-role client: no user identity; the mock ignores RLS anyway. */
export function createMockAdminClient(): SupabaseClient {
  return createMockClient(null)
}

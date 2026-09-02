import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { table, persist } from './store'
import { MockQueryBuilder } from './query-builder'
import { getMockUidFromStore } from './session'
import { receiptNumber } from '@/lib/services/finance/org-settings'
import { computeStatus } from '@/lib/assignments/late-status'

type Args = Record<string, unknown>

function profileByUid(uid: string | null): Record<string, unknown> | null {
  if (!uid) return null
  return table('profiles').find((p) => p.auth_user_id === uid) ?? null
}

async function rpc(uid: string | null, fn: string, args: Args) {
  if (fn === 'is_enrolled') {
    const me = profileByUid(uid)
    if (!me) return { data: false, error: null }
    const found = table('enrollments').some((r) => r.student_id === me.id && r.class_id === args.p_class_id)
    return { data: found, error: null }
  }
  if (fn === 'teaches_class' || fn === 'teaches_class_write') {
    const me = profileByUid(uid)
    if (!me) return { data: false, error: null }
    const teaches = table('class_tutors').some((r) => r.tutor_id === me.id && r.class_id === args.p_class_id)
    // teaches_class_write (0079) is the TUTOR-ONLY write scope.
    if (fn === 'teaches_class_write') return { data: teaches, error: null }
    // teaches_class (0043) is the READ scope: tutor OR mentor of a student actively enrolled
    // in the class (mentors_class - active mentorship AND matching student-scoped persona AND
    // enrollment). Post-0082 the two scopes genuinely diverge (calendar write went back to
    // teaches_class), so the mock must too, or a mentor's calendar create/edit is wrongly
    // refused (403) in mock mode while production allows it - the E2E suite runs on the mock.
    const mentee = new Set(
      table('mentorships')
        .filter((m) => m.mentor_id === me.id && m.active)
        .map((m) => m.student_id),
    )
    const scoped = new Set(
      table('persona_assignments')
        .filter(
          (p) =>
            p.profile_id === me.id &&
            p.persona_name === 'mentor' &&
            p.scope_type === 'student' &&
            p.status === 'active',
        )
        .map((p) => p.scope_id),
    )
    const mentorsClass = table('enrollments').some(
      (e) => e.class_id === args.p_class_id && mentee.has(e.student_id) && scoped.has(e.student_id),
    )
    return { data: teaches || mentorsClass, error: null }
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
  if (fn === 'finance_totals_base') {
    // Mirrors migration 0056's finance_totals_base: per-kind totals already
    // normalised into the CURRENT base currency, never mixing currencies. A doc
    // counts as converted only if it carries a base amount in that base; a
    // same-currency doc converts 1:1 (the 0056 backfill). Everything else is
    // flagged unconverted rather than summed.
    const base = String((table('org_settings')[0]?.base_currency as string | undefined) ?? 'INR')
    const rows = table(args.p_kind === 'receipt' ? 'receipts' : 'payslips').filter((r) => !r.voided)
    let baseTotal = 0
    let converted = 0
    let unconverted = 0
    for (const r of rows) {
      const bt = r.base_total != null ? Number(r.base_total) : r.currency === base ? Number(r.total) : null
      const bc = (r.base_currency as string | undefined) ?? (r.currency === base ? base : undefined)
      if (bt != null && bc === base) {
        baseTotal += bt
        converted += 1
      } else {
        unconverted += 1
      }
    }
    return {
      data: [
        { base_currency: base, base_total: baseTotal, converted_count: converted, unconverted_count: unconverted },
      ],
      error: null,
    }
  }
  if (fn === 'revoke_profile_guarded') {
    // Mirrors migration 0042: refuse to disable the last active admin, else flip
    // the target to disabled. Returns the same 'ok' | 'not_found' | 'last_admin'.
    const profiles = table('profiles')
    const target = profiles.find((p) => p.id === args.p_target)
    if (!target) return { data: 'not_found', error: null }
    if (target.role === 'admin' && target.status === 'active') {
      const activeAdmins = profiles.filter((p) => p.role === 'admin' && p.status === 'active').length
      if (activeAdmins <= 1) return { data: 'last_admin', error: null }
    }
    target.status = 'disabled'
    persist()
    return { data: 'ok', error: null }
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
  if (fn === 'edit_assignment_and_reclassify') {
    // Mirror the SECURITY DEFINER function (migration 0026): update the assignment
    // and re-derive every submission's lateness, atomically from the caller's view.
    const assignment = table('assignments').find((row) => row.id === args.p_id)
    if (!assignment) return { data: null, error: { message: `assignment ${String(args.p_id)} not found` } }
    assignment.title = args.p_title
    assignment.description = args.p_description
    assignment.due_date = args.p_due_date
    assignment.attachment_drive_link = args.p_attachment_drive_link
    assignment.topic = args.p_topic
    assignment.max_marks = args.p_max_marks
    const due = String(args.p_due_date)
    for (const sub of table('submissions')) {
      if (sub.assignment_id !== args.p_id) continue
      sub.status = computeStatus(String(sub.submitted_at), due)
    }
    persist()
    return { data: null, error: null }
  }
  return { data: null, error: { message: `mock rpc not implemented: ${fn}` } }
}

/** Builds a fake SupabaseClient over the in-memory store, acting as user `uid`. */
function createMockClient(uid: string | null): SupabaseClient {
  const me = profileByUid(uid)
  const client = {
    from: (name: string) => new MockQueryBuilder(table(name), name),
    rpc: (fn: string, args: Args = {}) => rpc(uid, fn, args),
    auth: {
      getUser: async () => ({ data: { user: me ? { id: uid, email: me.email } : null }, error: null }),
      // Mirrors supabase-js getClaims(): { data: { claims } | null }. sub === the
      // auth uid, matching what getActorContext reads.
      getClaims: async () => ({ data: me ? { claims: { sub: uid, email: me.email } } : null, error: null }),
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

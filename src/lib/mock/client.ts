import type { SupabaseClient } from '@supabase/supabase-js'
import { table, persist } from './store'
import { MockQueryBuilder } from './queryBuilder'
import { getMockUidFromStore } from './session'

type Args = Record<string, unknown>

function profileByUid(uid: string | null): Record<string, unknown> | null {
  if (!uid) return null
  return table('profiles').find((p) => p.auth_user_id === uid) ?? null
}

async function rpc(uid: string | null, fn: string, args: Args) {
  if (fn === 'next_document_number') {
    const counters = table('document_counters')
    let row = counters.find((c) => c.doc_type === args.p_doc_type && c.year === args.p_year)
    if (!row) { row = { doc_type: args.p_doc_type, year: args.p_year, last_number: 0 }; counters.push(row) }
    row.last_number = (row.last_number as number) + 1
    persist()
    return { data: row.last_number as number, error: null }
  }
  if (fn === 'teaches_class' || fn === 'is_enrolled') {
    const me = profileByUid(uid)
    if (!me) return { data: false, error: null }
    const tbl = fn === 'teaches_class' ? table('class_teachers') : table('enrollments')
    const idCol = fn === 'teaches_class' ? 'teacher_id' : 'student_id'
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

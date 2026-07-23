import { randomUUID } from 'node:crypto'
import { persist } from './store'

type Row = Record<string, unknown>
type Result<T = unknown> = { data: T; error: { message: string } | null; count?: number | null }
type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert'

/**
 * A tiny, in-memory stand-in for the supabase-js / PostgREST query builder,
 * covering the subset the repos use: select/insert/update/delete/upsert with
 * eq/in/gte/lte/gt/lt/is filters, order/limit/range, and single/maybeSingle.
 * It is a thenable, so `await query` resolves to `{ data, error }` like the real one.
 *
 * No RLS: rows are filtered only by the explicit predicates a caller chains.
 */
export class MockQueryBuilder implements PromiseLike<Result> {
  private filters: Array<(r: Row) => boolean> = []
  private orderBy: { col: string; asc: boolean } | null = null
  private limitN: number | null = null
  private rangeFrom: number | null = null
  private op: Op = 'select'
  private payload: Row | Row[] | null = null
  private onConflict: string | null = null
  private returning = false
  private want: 'single' | 'maybe' | null = null
  private wantCount = false
  private headOnly = false

  constructor(
    private rows: Row[],
    private tableName: string,
  ) {}

  // ---- filters -------------------------------------------------------------
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val)
    return this
  }
  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val)
    return this
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]))
    return this
  }
  gte(col: string, val: unknown) {
    this.filters.push((r) => (r[col] as never) >= (val as never))
    return this
  }
  lte(col: string, val: unknown) {
    this.filters.push((r) => (r[col] as never) <= (val as never))
    return this
  }
  gt(col: string, val: unknown) {
    this.filters.push((r) => (r[col] as never) > (val as never))
    return this
  }
  lt(col: string, val: unknown) {
    this.filters.push((r) => (r[col] as never) < (val as never))
    return this
  }
  is(col: string, val: unknown) {
    this.filters.push((r) => (val === null ? r[col] == null : r[col] === val))
    return this
  }
  ilike(col: string, pattern: string) {
    const needle = String(pattern).replace(/%/g, '').toLowerCase()
    this.filters.push((r) =>
      String(r[col] ?? '')
        .toLowerCase()
        .includes(needle),
    )
    return this
  }
  /** Minimal stand-in for PostgREST's `.or('col.op.val,col2.op2.val2')` - only
   *  the operators callers actually use (ilike/eq/is), matched against ANY
   *  clause. Real cross-column OR search (e.g. name-or-email) has nowhere
   *  else to go: two separate single-column queries can't be merged into one
   *  correctly-paginated result. */
  or(filterString: string) {
    const clauses = filterString.split(',').map((clause) => {
      const [col, op, ...rest] = clause.split('.')
      const value = rest.join('.')
      if (op === 'ilike') {
        const needle = value.replace(/%/g, '').toLowerCase()
        return (r: Row) =>
          String(r[col] ?? '')
            .toLowerCase()
            .includes(needle)
      }
      if (op === 'is') {
        return (r: Row) => (value === 'null' ? r[col] == null : String(r[col]) === value)
      }
      if (op === 'eq') {
        return (r: Row) => String(r[col]) === value
      }
      throw new Error(`MockQueryBuilder.or(): unsupported operator "${op}" in clause "${clause}"`)
    })
    this.filters.push((r) => clauses.some((matches) => matches(r)))
    return this
  }

  // ---- shaping -------------------------------------------------------------
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false }
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  range(from: number, to: number) {
    this.rangeFrom = from
    this.limitN = to - from + 1
    return this
  }

  select(cols = '*', opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    void cols
    if (this.op !== 'select') this.returning = true
    if (opts?.count) this.wantCount = true
    if (opts?.head) this.headOnly = true
    return this
  }

  // ---- mutations -----------------------------------------------------------
  insert(payload: Row | Row[]) {
    this.op = 'insert'
    this.payload = payload
    return this
  }
  update(payload: Row) {
    this.op = 'update'
    this.payload = payload
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert'
    this.payload = payload
    this.onConflict = opts?.onConflict ?? null
    return this
  }

  // ---- terminals -----------------------------------------------------------
  single(): Promise<Result> {
    this.want = 'single'
    return this.exec()
  }
  maybeSingle(): Promise<Result> {
    this.want = 'maybe'
    return this.exec()
  }
  then<R1 = Result, R2 = never>(
    onfulfilled?: ((v: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.exec().then(onfulfilled, onrejected)
  }

  // ---- engine --------------------------------------------------------------
  private match(): Row[] {
    return this.rows.filter((r) => this.filters.every((f) => f(r)))
  }

  private withDefaults(row: Row): Row {
    const out = { ...row }
    if (out.id === undefined) out.id = randomUUID()
    if (out.created_at === undefined) out.created_at = new Date().toISOString()
    return out
  }

  private shapeReturn(result: Row[], count?: number): Result {
    const base = count !== undefined ? { count } : {}
    if (this.want === 'single') return { ...base, data: (result[0] ?? null) as Row, error: null }
    if (this.want === 'maybe') return { ...base, data: (result[0] ?? null) as Row, error: null }
    return { ...base, data: result, error: null }
  }

  private async exec(): Promise<Result> {
    if (this.op === 'select') {
      const matched = this.match()
      const count = this.wantCount ? matched.length : undefined
      if (this.headOnly) return { data: [], error: null, count: count ?? 0 }
      let out = matched
      if (this.orderBy) {
        const { col, asc } = this.orderBy
        out = [...out].sort((a, b) => {
          const av = a[col] as never,
            bv = b[col] as never
          return (av < bv ? -1 : av > bv ? 1 : 0) * (asc ? 1 : -1)
        })
      }
      if (this.rangeFrom != null && this.limitN != null) {
        out = out.slice(this.rangeFrom, this.rangeFrom + this.limitN)
      } else if (this.limitN != null) {
        out = out.slice(0, this.limitN)
      }
      return this.shapeReturn(out, count)
    }

    if (this.op === 'insert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
      const created = incoming.map((r) => this.withDefaults(r))
      this.rows.push(...created)
      persist()
      return this.returning ? this.shapeReturn(created) : { data: null, error: null }
    }

    if (this.op === 'update') {
      const patch = this.payload as Row
      const matched = this.match()
      matched.forEach((r) => Object.assign(r, patch))
      persist()
      return this.returning ? this.shapeReturn(matched) : { data: null, error: null }
    }

    if (this.op === 'delete') {
      const matched = new Set(this.match())
      const keep = this.rows.filter((r) => !matched.has(r))
      this.rows.length = 0
      this.rows.push(...keep)
      persist()
      return { data: null, error: null }
    }

    // upsert
    const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
    const keys = (this.onConflict ?? 'id').split(',').map((k) => k.trim())
    const affected: Row[] = []
    for (const item of incoming) {
      const existing = this.rows.find((r) => keys.every((k) => r[k] === item[k]))
      if (existing) {
        Object.assign(existing, item)
        affected.push(existing)
      } else {
        const row = this.withDefaults(item)
        this.rows.push(row)
        affected.push(row)
      }
    }
    persist()
    return this.returning ? this.shapeReturn(affected) : { data: null, error: null }
  }
}

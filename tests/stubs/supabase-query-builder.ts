import { vi } from 'vitest'

/**
 * A chainable Supabase query-builder stub: every method returns the same
 * builder (so any chain shape works), and it resolves via `.then` for call
 * sites that await the builder directly (e.g. `.update().eq()`) as well as
 * via explicit `.single()`/`.maybeSingle()` terminals.
 *
 * IMPORTANT: the CLIENT object returned by `createClient()`/`createAdminClient()`
 * must NOT itself be thenable — `await createClient()` would auto-unwrap it as
 * a promise resolution value (per the Promise/A+ thenable-adoption rule),
 * collapsing it straight to `result` before `.from()` is ever reached. Only
 * the per-query builder returned BY `.from()` is thenable — use `makeClient`
 * (never `queryBuilder` directly) as a mocked client's resolved/return value.
 */
type QueryResult = { data: unknown; error: unknown; count?: number | null }
type RpcResult = { data: unknown; error: unknown }

interface StubQueryBuilder {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  neq: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  gte: ReturnType<typeof vi.fn>
  lte: ReturnType<typeof vi.fn>
  gt: ReturnType<typeof vi.fn>
  lt: ReturnType<typeof vi.fn>
  not: ReturnType<typeof vi.fn>
  or: ReturnType<typeof vi.fn>
  ilike: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  range: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  then: (resolve: (v: QueryResult) => void) => Promise<unknown>
}

export function queryBuilder(result: QueryResult): StubQueryBuilder {
  const builder: StubQueryBuilder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    in: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    not: vi.fn(() => builder),
    or: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    range: vi.fn(() => builder),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  }
  return builder
}

/** A mocked Supabase client whose `.from(...)` always returns a fresh
 *  `queryBuilder(result)` — pass this as the resolved/return value of a
 *  mocked `createClient`/`createAdminClient`. `result.count` is only needed
 *  for `count: 'exact'`-style head-count queries. */
export function makeClient(result: QueryResult, rpcResult?: RpcResult) {
  return {
    from: vi.fn(() => queryBuilder(result)),
    rpc: vi.fn(
      async () => (rpcResult ?? { data: null, error: { message: 'mock rpc not configured' } }) satisfies RpcResult,
    ),
  }
}

/**
 * Like `makeClient`, but every `.from(...)` returns the SAME builder and hands it back, so
 * a test can assert WHICH COLUMN a query filtered on - not merely that it returned rows.
 *
 * That distinction is not academic. A read keyed on the wrong column still returns
 * plausible data and still passes a returns-the-rows test: the bug that let a student read
 * a session they never attended was exactly `.eq('session_date', ...)` where
 * `.eq('session_id', ...)` was meant, and it was invisible to the whole unit suite because
 * nothing asserted the key. Use this wherever the key carries a correctness or security
 * meaning rather than being incidental.
 *
 * CAVEAT: every `.from(...)` returns the SAME builder, so a function issuing more than one
 * query mixes their calls together and an assertion about "the" key becomes meaningless.
 * The returned `client.from` is a spy - assert its call count is 1 before trusting a key
 * assertion, which is what makes the test honest rather than merely green.
 */
export function makeClientCapturing(result: QueryResult, rpcResult?: RpcResult) {
  const builder = queryBuilder(result)
  return {
    builder,
    client: {
      from: vi.fn(() => builder),
      rpc: vi.fn(
        async () => (rpcResult ?? { data: null, error: { message: 'mock rpc not configured' } }) satisfies RpcResult,
      ),
    },
  }
}

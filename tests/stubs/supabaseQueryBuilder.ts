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
export function queryBuilder(result: { data: unknown; error: unknown }) {
  const builder: any = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  }
  return builder
}

/** A mocked Supabase client whose `.from(...)` always returns a fresh
 *  `queryBuilder(result)` — pass this as the resolved/return value of a
 *  mocked `createClient`/`createAdminClient`. */
export function makeClient(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => queryBuilder(result)) }
}

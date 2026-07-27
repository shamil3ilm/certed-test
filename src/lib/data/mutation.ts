import 'server-only'
import { NotFoundError } from '@/lib/errors'

/**
 * Assert a soft-remove / update actually hit a row.
 *
 * PostgREST returns NO error for an UPDATE/DELETE that matched 0 rows, so a bare
 * `.update(...).eq(...)` can silently no-op on a stale/deleted id while the caller
 * proceeds to audit a mutation that never happened. Pair the write with a
 * `.select('id')` and pass the result here: a 0-row result becomes a loud
 * NotFound, and a matched row (active OR inactive) passes so idempotent re-removes
 * still work.
 *
 * `context` prefixes the raw DB error, matching the data layer's
 * `throw new Error(\`context: ...\`)` convention; `notFound` is the user-facing
 * message when nothing matched.
 */
export function assertMutated(
  result: { data: unknown[] | null; error: { message: string } | null },
  context: string,
  notFound: string,
): void {
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  if (!result.data || result.data.length === 0) throw new NotFoundError(notFound)
}

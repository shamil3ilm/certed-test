import 'server-only'

/**
 * Fetch EVERY row a query would return, in pages, so a client-side aggregate
 * (sum / count / week-bucketing / full export) stays correct no matter how many rows
 * there are. PostgREST caps each response at the project's "Max rows" setting (default
 * 1000), so an unbounded `.select()` silently returns only the first page and any total
 * computed from it understates. Pass a factory that applies `.range(from, to)` to a
 * freshly-built query each call; we stop once a page returns fewer than `pageSize` rows.
 *
 * Use this only for reads that MUST be complete to be correct (aggregates, exports).
 * For a paginated DISPLAY, page in the UI instead - do not pull every row to render.
 */
/**
 * The FIRST `n` rows a query would return, fetched in chunks.
 *
 * `.limit(n)` cannot do this once n exceeds the PostgREST row cap: the response is capped
 * regardless, so the caller gets 1000 rows while believing it asked for more. That matters
 * where n is derived rather than fixed - the announcements Stream asks each of its two
 * sources for `page * pageSize` rows so the merge can be sliced correctly, which silently
 * broke past roughly page 50.
 *
 * Stops as soon as a page comes back short, so a query with fewer than `n` rows costs one
 * round trip rather than n / pageSize of them.
 */
export async function fetchUpTo<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  n: number,
  label: string,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; from < n; from += pageSize) {
    const to = Math.min(from + pageSize, n) - 1
    const { data, error } = await page(from, to)
    if (error) throw new Error(`${label}: ${error.message}`)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < to - from + 1) break
  }
  return all
}

export async function fetchAllPaged<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) return all
  }
}

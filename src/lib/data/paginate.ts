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

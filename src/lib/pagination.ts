/**
 * Pagination arithmetic shared by every paginated view. Framework-agnostic (no
 * `server-only`) so client pagination controls can use `totalPages` too.
 */

/** Parse a 1-based page query param, defaulting to 1 and never below 1. Accepts
 *  the raw `string | string[] | undefined` a searchParam yields (a non-numeric or
 *  missing value falls back to page 1). */
export function parsePageParam(raw: unknown): number {
  return Math.max(1, Number(raw) || 1)
}

/** Number of pages for `total` rows at `pageSize` per page - at least 1, even
 *  with zero rows, so "Page 1 of 1" always holds. */
export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

/**
 * Fold a requested page back inside the range that actually exists.
 *
 * parsePageParam can only clamp the LOWER bound - it has no idea how many rows there
 * are. So a hand-edited or stale `?page=999999` sails through, the query returns an empty
 * slice, and the user gets a blank list with no rows, no explanation, and no way back
 * except editing the URL. Showing the last real page is what the reader meant.
 */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, page), totalPages(total, pageSize))
}

/** The slice of `items` shown on `page`. For in-memory pagination of a list a
 *  page already holds in full - e.g. one where the totals/filters need the whole
 *  set (own receipts, class list) - so the rendered list is bounded and the pager
 *  works, without a second count query. Pass the FULL/filtered array as `total`. */
export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const from = (page - 1) * pageSize
  return items.slice(from, from + pageSize)
}

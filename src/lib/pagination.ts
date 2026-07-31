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

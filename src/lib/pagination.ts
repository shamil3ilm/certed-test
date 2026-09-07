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

/**
 * The slice of `items` shown on `page`, for in-memory pagination of a list the page
 * already holds in full.
 *
 * ONLY for a list whose source read is itself BOUNDED - a fixed-size set, or one already
 * capped by the query. Over an unbounded `.select()` this looks like pagination but is
 * not: PostgREST caps the response at the project's Max rows (default 1000), so the
 * fetch silently truncates, `total` understates, and later pages are unreachable. Every
 * call site is enumerated by tests/unit/pagination-boundedness.test.ts - a new one has
 * to justify itself there. When the source grows without bound, page in SQL instead
 * (toRange + `.range()` + `count: 'exact'`).
 */
export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const from = (page - 1) * pageSize
  return items.slice(from, from + pageSize)
}

/** The INCLUSIVE `[from, to]` bounds PostgREST's `.range()` wants for a 1-based page.
 *  That inclusive `to` is the off-by-one this replaces: the same two lines were copied
 *  into nine data/service modules, and each one had to remember the `- 1`. */
export function toRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize
  return { from, to: from + pageSize - 1 }
}

/**
 * One page of rows plus the TOTAL matching the same filters (not the page length).
 *
 * The shared shape for every paged read. `total` must come from the query's own
 * `count: 'exact'`, never from `items.length` - the pager's "Page 3 of 12" and the empty
 * state both read it, and a page-local count silently caps the list at one page.
 */
export type Page<T> = { items: T[]; total: number }

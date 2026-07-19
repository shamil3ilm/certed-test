/**
 * Sort utilities for common data patterns.
 */

export function sortByCreatedAtDesc<T extends { created_at: string }>(a: T, b: T): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

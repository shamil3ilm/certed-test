/** Escapes ilike wildcards (`%`, `_`) in free-text search input so a literal
 *  character typed by the caller can't widen the match. */
export function escapeIlike(s: string): string {
  return s.replace(/[%_]/g, (c) => `\\${c}`)
}

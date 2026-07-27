/** Escapes ilike wildcards (`%`, `_`) in free-text search input so a literal
 *  character typed by the caller can't widen the match. */
export function escapeIlike(s: string): string {
  return s.replace(/[%_]/g, (c) => `\\${c}`)
}

/** Prepares a free-text term for use INSIDE a PostgREST `.or(...)` filter string
 *  (e.g. `col.ilike.%term%,other.ilike.%term%`). On top of escaping ilike
 *  wildcards, it strips the characters PostgREST uses as the `.or()` grammar
 *  ( , ( ) " backslash ) so a term like "Smith, John" can't split into extra
 *  filter conditions and parentheses can't inject nested and/or logic. */
export function escapeOrIlike(s: string): string {
  return escapeIlike(s.replace(/[,()"\\]/g, ' '))
}

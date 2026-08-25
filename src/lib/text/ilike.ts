/** Escapes ilike wildcards in free-text search input so a literal character typed by
 *  the caller can't widen the match. The char class INCLUDES the escape char `\`, so a
 *  backslash the user already typed is escaped in the same pass - otherwise it would
 *  pair with our escaping backslash and turn an escaped `%`/`_` back into a live
 *  wildcard. `*` is not a SQL wildcard, but PostgREST substitutes it for `%`, so a
 *  literal `*` is stripped here too. */
export function escapeIlike(s: string): string {
  return s.replace(/\*/g, '').replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Prepares a free-text term for use INSIDE a PostgREST `.or(...)` filter string
 *  (e.g. `col.ilike.%term%,other.ilike.%term%`). On top of escaping ilike
 *  wildcards, it strips the characters PostgREST uses as the `.or()` grammar
 *  ( , ( ) " backslash ) so a term like "Smith, John" can't split into extra
 *  filter conditions and parentheses can't inject nested and/or logic. */
export function escapeOrIlike(s: string): string {
  // Strip the .or() grammar chars to spaces, then collapse/trim the whitespace
  // so a term made only of those chars (e.g. "()") doesn't survive as "  " and
  // match posts containing double-spaces - it collapses to an empty pattern
  // (no effective filter) instead.
  return escapeIlike(
    s
      .replace(/[,()"\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

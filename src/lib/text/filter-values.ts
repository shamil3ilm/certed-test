/**
 * Guards for values interpolated into a PostgREST `.or(...)` filter string.
 *
 * `.or()` takes a string whose grammar is commas, dots and parentheses - which is why
 * escapeOrIlike exists for free text. STRUCTURED values (an id, an instant) are handled
 * differently: they are validated, not escaped. A uuid cannot legitimately contain that
 * grammar, so a value that does is a bug upstream, and quietly stripping it would turn a
 * broken filter into a silently different one - the failure mode these guards exist to stop.
 *
 * Cheap, and deliberately at the point of interpolation rather than at the caller: the
 * caller that forgets is exactly the one that introduces the hole.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** An ISO-8601 instant as Postgres returns it - no commas, dots only in the fraction. */
const INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/

/** Throws unless `id` is a bare uuid, so it can never carry `.or()` grammar. */
export function assertFilterSafeId(id: string, where: string): void {
  if (!UUID.test(id)) throw new Error(`${where}: refusing to build a filter from a non-uuid value`)
}

/** True when `value` is an instant safe to interpolate. Callers fail CLOSED on false. */
export function isFilterSafeInstant(value: string | null): value is string {
  return value != null && INSTANT.test(value)
}

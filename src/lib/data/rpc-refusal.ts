/**
 * The refusal a Postgres function raised, when it is one the caller expects.
 *
 * Functions signal expected refusals with `raise exception '<code>'`, which PostgREST returns as
 * the error message. A data caller names the codes it handles and turns a match into a typed
 * result, so no service string-matches database text and any other failure still throws. The
 * suffix match accepts a code that has already been wrapped as `<context>: <code>`.
 */
export function refusalOf<C extends string>(
  error: { message: string } | null | undefined,
  codes: readonly C[],
): C | null {
  if (!error) return null
  return codes.find((code) => error.message === code || error.message.endsWith(`: ${code}`)) ?? null
}

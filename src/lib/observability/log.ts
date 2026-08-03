/**
 * Structured server-side error log.
 *
 * On Vercel, stderr is captured into the platform logs, so `console.error` IS
 * the sink - this wrapper just gives every call a consistent, greppable shape
 * (`[context] message` + optional structured meta) so a failure that is
 * otherwise swallowed (a best-effort side effect, an unknown-error API branch)
 * is diagnosable instead of invisible.
 *
 * Use it in a catch that intentionally does NOT rethrow: the caller's flow is
 * preserved, but the failure stops being silent. Never pass user-facing copy or
 * secrets in `meta`; this goes to server logs only.
 */
export function logError(context: string, error: unknown, meta?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error)
  const detail: Record<string, unknown> = { ...meta }
  if (error instanceof Error && error.stack) detail.stack = error.stack
  console.error(`[${context}] ${message}`, detail)
}

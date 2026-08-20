/**
 * Defence-in-depth PII scrub for Sentry events. logError's contract already
 * forbids passing personal data in `meta`, but that is a convention a future call
 * site could break. This redacts anything matching an email address or IP from an
 * event's `extra` and `tags` before it leaves the process, so no single call site
 * can leak contact data to the error tracker. Pure (no server-only), so both the
 * server and client Sentry inits can share it.
 *
 * Deliberately over-eager: a false redaction in an error report costs nothing,
 * while a leaked address on a minors' platform is unrecoverable.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
const IPV6 = /\b(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{1,4}\b/gi

function redactString(value: string): string {
  return value.replace(EMAIL, '[redacted-email]').replace(IPV4, '[redacted-ip]').replace(IPV6, '[redacted-ip]')
}

function redactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    out[key] = typeof value === 'string' ? redactString(value) : value
  }
  return out
}

/**
 * Return a shallow copy of a Sentry event with email/IP-shaped strings redacted
 * from `extra` and `tags`. Wire as Sentry.init({ beforeSend }).
 */
export function scrubPiiFromEvent<T extends { extra?: Record<string, unknown>; tags?: Record<string, unknown> }>(
  event: T,
): T {
  const next = { ...event }
  if (event.extra) next.extra = redactRecord(event.extra) as T['extra']
  if (event.tags) next.tags = redactRecord(event.tags) as T['tags']
  return next
}

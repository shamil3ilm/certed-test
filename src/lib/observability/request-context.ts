import 'server-only'
import { headers } from 'next/headers'
import * as Sentry from '@sentry/nextjs'

const REQUEST_ID_TAG = 'request_id'
const VERCEL_ID_TAG = 'vercel_id'

/**
 * Universal request correlation ID across cloud providers, container hosts, and reverse proxies.
 * Checks standard correlation headers in priority order (x-request-id, x-correlation-id,
 * x-vercel-id, traceparent).
 */
export async function getRequestId(): Promise<string | null> {
  try {
    const h = await headers()
    return h.get('x-request-id') ?? h.get('x-correlation-id') ?? h.get('x-vercel-id') ?? h.get('traceparent') ?? null
  } catch {
    return null
  }
}

/**
 * Stamp the request id onto Sentry's per-request isolation scope so every event
 * captured during this request carries it as a searchable tag - including the
 * swallowed-catch forwards from logError, which never throw and so are invisible
 * to Sentry's automatic instrumentation. Called once per request from the shared
 * actor loader. No-op when there is no id (local) or no DSN (Sentry disabled).
 */
export async function tagRequestScope(): Promise<void> {
  const id = await getRequestId()
  if (id) {
    Sentry.getIsolationScope().setTag(REQUEST_ID_TAG, id)
    Sentry.getIsolationScope().setTag(VERCEL_ID_TAG, id)
  }
}

/**
 * The request id previously stamped onto the isolation scope, read back
 * synchronously so a sync logger can include it as a log field. Undefined when it
 * was never set (no id, or called before the actor loader ran).
 */
export function currentRequestId(): string | undefined {
  const scopeTags = Sentry.getIsolationScope().getScopeData().tags
  const value = scopeTags?.[REQUEST_ID_TAG] ?? scopeTags?.[VERCEL_ID_TAG]
  return typeof value === 'string' ? value : undefined
}

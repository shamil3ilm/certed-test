import 'server-only'
import { headers } from 'next/headers'
import * as Sentry from '@sentry/nextjs'

const REQUEST_ID_HEADER = 'x-vercel-id'
const REQUEST_ID_TAG = 'vercel_id'

/**
 * The platform request id. Vercel stamps `x-vercel-id` on every incoming request
 * and records it in its own request log, so carrying it into our logs and Sentry
 * events lets one request be followed across the proxy, the render, and the data
 * layer. Null outside a request scope, or where the header is absent (local dev,
 * a non-Vercel host).
 */
export async function getRequestId(): Promise<string | null> {
  try {
    return (await headers()).get(REQUEST_ID_HEADER)
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
  if (id) Sentry.getIsolationScope().setTag(REQUEST_ID_TAG, id)
}

/**
 * The request id previously stamped onto the isolation scope, read back
 * synchronously so a sync logger can include it as a log field. Undefined when it
 * was never set (no id, or called before the actor loader ran).
 */
export function currentRequestId(): string | undefined {
  const value = Sentry.getIsolationScope().getScopeData().tags?.[REQUEST_ID_TAG]
  return typeof value === 'string' ? value : undefined
}

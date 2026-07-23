import { requestJson } from '../../api-client'

/** Thin JSON wrapper over requestJson - sets the content type only when there
 *  is a body, so GET and DELETE don't send an empty one. */
export async function api<T>(path: string, method: string, body?: unknown) {
  return requestJson<T>(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

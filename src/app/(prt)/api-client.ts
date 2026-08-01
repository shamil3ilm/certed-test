'use client'

import type { ApiResponse } from '@/lib/api/response'

// A page that is navigating away cancels its in-flight fetches, and those reject
// exactly like a real failure ("TypeError: Failed to fetch"). Track unload so a
// benign cancellation is not logged as a network error (it briefly showed up as a
// console error whenever a user left /calendar mid-request).
let navigatingAway = false
if (typeof window !== 'undefined') {
  const markLeaving = () => {
    navigatingAway = true
  }
  window.addEventListener('pagehide', markLeaving)
  window.addEventListener('beforeunload', markLeaving)
}

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'

  let response: Response
  try {
    response = await fetch(input, init)
  } catch (networkError) {
    // An intentional cancellation - the page is unloading/navigating, or the caller
    // aborted the request - is not a failure worth logging; reject it quietly.
    if (navigatingAway || init?.signal?.aborted) {
      throw new Error(`${method} request cancelled`)
    }
    // A genuine fetch rejection (offline / DNS / CORS) would otherwise surface a raw
    // "TypeError: Failed to fetch" to the user. Keep the detail in the console;
    // callers render this generic message. API/validation errors below still
    // pass through, since those come from the server's already-masked envelope.
    console.error(`[api] ${method} ${String(input)} network error:`, networkError)
    throw new Error(`${method} request failed`)
  }

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null

  if (!response.ok || !payload) {
    throw new Error(`${method} request failed`)
  }

  if (payload.success === false) {
    throw new Error(payload.error ?? `${method} request failed`)
  }

  return payload.data
}

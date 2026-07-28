'use client'

import type { ApiResponse } from '@/lib/api/response'

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'

  let response: Response
  try {
    response = await fetch(input, init)
  } catch (networkError) {
    // A fetch rejection (offline / DNS / CORS) would otherwise surface a raw
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

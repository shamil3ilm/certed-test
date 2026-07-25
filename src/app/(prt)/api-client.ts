'use client'

import type { ApiResponse } from '@/lib/api/response'

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null

  if (!response.ok || !payload) {
    throw new Error(`${init?.method ?? 'GET'} request failed`)
  }

  if (payload.success === false) {
    throw new Error(payload.error ?? `${init?.method ?? 'GET'} request failed`)
  }

  return payload.data
}

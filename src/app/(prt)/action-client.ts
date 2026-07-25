'use client'

import type { ActionResult, ActionStatusResult } from '@/lib/api/action-error'

type PortalActionResult<T = unknown> = ActionResult<T> | ActionStatusResult

export function assertActionOk<T>(result: PortalActionResult<T>, fallback = 'Request failed') {
  if (!result.ok) {
    throw new Error(result.error || fallback)
  }

  return 'data' in result ? result.data : undefined
}

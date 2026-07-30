import { z } from 'zod'
import { ERROR_CODES, type ErrorCode } from '@/lib/api/error-codes'

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().default(''),
  message: z.string().trim().min(1).max(5000),
})

type ContactRelayResult = { success: true } | { success: false; status: number; error: string; code: ErrorCode }

type ContactRelayOptions = {
  scriptUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** Validates and relays a public contact submission to the configured Apps Script. */
export async function relayContactSubmission(
  raw: unknown,
  opts: ContactRelayOptions = {},
): Promise<ContactRelayResult> {
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as Record<string, unknown>).website === 'string' &&
    ((raw as Record<string, unknown>).website as string).trim() !== ''
  ) {
    return { success: true }
  }

  const parsed = contactSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      status: 400,
      error: 'Please fill in all fields correctly.',
      code: ERROR_CODES.invalidInput,
    }
  }

  if (!opts.scriptUrl) {
    // Known deploy misconfiguration (GOOGLE_SCRIPT_URL unset), not a runtime
    // crash. Log it so operators see the cause, and degrade to a friendly
    // "temporarily unavailable" (503) rather than a bare 500 that reads as a bug
    // to the visitor and pollutes the 5xx error budget.
    console.error('[contact] GOOGLE_SCRIPT_URL is not configured; contact submissions cannot be relayed.')
    return {
      success: false,
      status: 503,
      error: 'Sorry, the contact form is temporarily unavailable. Please try again later or email us directly.',
      code: ERROR_CODES.internalError,
    }
  }

  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? 10000

  try {
    const response = await fetchImpl(opts.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      throw new Error('Failed to reach Google Script')
    }

    const text = await response.text()
    let result: { success?: boolean; result?: string; error?: string }
    try {
      result = JSON.parse(text) as { success?: boolean; result?: string; error?: string }
    } catch {
      result = { success: true }
    }

    if (result.success || result.result === 'success') {
      return { success: true }
    }
    return {
      success: false,
      status: 500,
      error: result.error || 'Unknown error',
      code: ERROR_CODES.internalError,
    }
  } catch {
    return {
      success: false,
      status: 500,
      error: 'Internal Server Error',
      code: ERROR_CODES.internalError,
    }
  }
}

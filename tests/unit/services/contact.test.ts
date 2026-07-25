import { describe, expect, it, vi } from 'vitest'
import { ERROR_CODES } from '@/lib/api/error-codes'
import { relayContactSubmission } from '@/lib/services/contact'

describe('relayContactSubmission', () => {
  it('pretends success for a filled honeypot field', async () => {
    await expect(
      relayContactSubmission({ name: 'Bot', email: 'bot@test.com', message: 'spam', website: 'https://spam.test' }),
    ).resolves.toEqual({ success: true })
  })

  it('rejects invalid contact payloads', async () => {
    await expect(relayContactSubmission({ name: '', email: 'bad', message: '' })).resolves.toEqual({
      success: false,
      status: 400,
      error: 'Please fill in all fields correctly.',
      code: ERROR_CODES.invalidInput,
    })
  })

  it('rejects when the relay URL is missing', async () => {
    await expect(
      relayContactSubmission({ name: 'Asha', email: 'asha@test.com', phone: '', message: 'Hello' }),
    ).resolves.toEqual({
      success: false,
      status: 500,
      error: 'Server configuration error.',
      code: ERROR_CODES.internalError,
    })
  })

  it('returns success for a successful relay response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ success: true }),
    })) as any

    await expect(
      relayContactSubmission(
        { name: 'Asha', email: 'asha@test.com', phone: '', message: 'Hello' },
        { scriptUrl: 'https://example.com', fetchImpl, timeoutMs: 5000 },
      ),
    ).resolves.toEqual({ success: true })
  })

  it('returns an internal error when the relay request fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('boom')
    }) as any

    await expect(
      relayContactSubmission(
        { name: 'Asha', email: 'asha@test.com', phone: '', message: 'Hello' },
        { scriptUrl: 'https://example.com', fetchImpl },
      ),
    ).resolves.toEqual({
      success: false,
      status: 500,
      error: 'Internal Server Error',
      code: ERROR_CODES.internalError,
    })
  })
})

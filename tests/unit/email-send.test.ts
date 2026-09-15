import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { sendEmail } from '@/lib/email/resend'

const ENV = {
  EMAIL_NOTIFICATIONS_ENABLED: 'true',
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'Cert-Ed <no-reply@example.com>',
}

beforeEach(() => {
  send.mockReset()
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value)
})
afterEach(() => vi.unstubAllEnvs())

describe('sendEmail', () => {
  it('forwards an idempotency key, so the provider answers a repeat without sending it again', async () => {
    send.mockResolvedValue({ data: { id: 'm1' }, error: null })
    await expect(sendEmail('a@x.dev', 'S', '<p>H</p>', { idempotencyKey: 'pending-email/e1' })).resolves.toBe(true)
    expect(send).toHaveBeenCalledWith(
      { from: ENV.EMAIL_FROM, to: 'a@x.dev', subject: 'S', html: '<p>H</p>' },
      { idempotencyKey: 'pending-email/e1' },
    )
  })

  it('sends without request options when no key is given', async () => {
    send.mockResolvedValue({ data: { id: 'm1' }, error: null })
    await sendEmail('a@x.dev', 'S', '<p>H</p>')
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@x.dev' }), undefined)
  })

  it('reports a repeat refused while the first is still in flight as a failure to retry, not a throw', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'concurrent_idempotent_requests', message: 'in progress' } })
    await expect(sendEmail('a@x.dev', 'S', '<p>H</p>', { idempotencyKey: 'pending-email/e1' })).resolves.toBe(false)
  })
})

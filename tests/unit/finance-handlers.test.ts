import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'admin-1', email: 'admin@example.com', role: 'admin', status: 'active' } as any
const personas = [{ id: 'pa-1', persona_name: 'admin', status: 'active' }] as any
vi.mock('@/lib/session/actor-context', () => ({
  getActorContext: vi.fn(async () => ({
    userId: 'auth-1',
    profile,
    personas,
    accessState: profile.status === 'active' ? 'active' : profile.status === 'disabled' ? 'disabled' : 'pending',
  })),
}))

vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ ok: true, retryAfterSec: 60 })),
}))

const issueDocFromApiInput: any = vi.fn(async () => ({ id: 'doc-1', number: 'CEA-R-2026-0001' }))
vi.mock('@/lib/finance/issue', () => ({
  issueDocFromApiInput: (...args: any[]) => issueDocFromApiInput(...args),
}))

const voidDoc: any = vi.fn(async () => true)
const listAllDocs: any = vi.fn(async () => [])
const validateFinanceDocId: any = vi.fn((id: unknown) => id as string)
vi.mock('@/lib/services/finance/finance-docs', () => ({
  voidDoc: (...args: any[]) => voidDoc(...args),
  listAllDocs: (...args: any[]) => listAllDocs(...args),
  validateFinanceDocId: (...args: any[]) => validateFinanceDocId(...args),
}))

const renderDocPdf: any = vi.fn(async () => ({ pdf: Buffer.from('pdf'), number: 'CEA-R-2026-0001' }))
vi.mock('@/lib/finance/render', () => ({
  renderDocPdf: (...args: any[]) => renderDocPdf(...args),
}))

vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn(async () => {}) }))

import { ValidationError } from '@/lib/errors'
import { issueHandler, voidHandler, pdfHandler } from '@/lib/finance/handlers'

const jsonReq = (url: string, body: any) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  profile.role = 'admin'
  profile.status = 'active'
})

describe('finance handlers', () => {
  it('issueHandler delegates payload parsing to the finance domain helper', async () => {
    const POST = issueHandler('receipt')
    const res = await POST(
      jsonReq('http://t/api/receipts', {
        party_id: '550e8400-e29b-41d4-a716-446655440000',
        issue_date: '2026-07-16',
        currency: 'INR',
        lines: [{ subject: 'Tuition', hours: 1, rate: 1000 }],
      }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(issueDocFromApiInput).toHaveBeenCalled()
  })

  it('issueHandler maps validation errors to HTTP 422', async () => {
    issueDocFromApiInput.mockRejectedValueOnce(new ValidationError('invalid input'))
    const POST = issueHandler('receipt')
    const res = await POST(jsonReq('http://t/api/receipts', { bad: true }))
    const json = await res.json()
    expect(res.status).toBe(422)
    expect(json.success).toBe(false)
  })

  it('voidHandler delegates id parsing to the finance-doc service helper', async () => {
    const POST = voidHandler('receipt')
    const res = await POST(new Request('http://t/api/receipts/x/void', { method: 'POST' }), {
      params: { id: '550e8400-e29b-41d4-a716-446655440000' },
    })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(validateFinanceDocId).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000')
    expect(voidDoc).toHaveBeenCalled()
  })

  it('voidHandler maps invalid ids to HTTP 422', async () => {
    validateFinanceDocId.mockImplementationOnce(() => {
      throw new ValidationError('Invalid finance document id')
    })
    const POST = voidHandler('receipt')
    const res = await POST(new Request('http://t/api/receipts/bad/void', { method: 'POST' }), {
      params: { id: 'bad' },
    })
    const json = await res.json()
    expect(res.status).toBe(422)
    expect(json.success).toBe(false)
  })

  it('pdfHandler also validates the document id before rendering', async () => {
    profile.role = 'tutor'
    const GET = pdfHandler('receipt')
    const res = await GET(new Request('http://t/api/receipts/doc/pdf'), {
      params: { id: '550e8400-e29b-41d4-a716-446655440000' },
    })
    expect(res.status).toBe(200)
    expect(validateFinanceDocId).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000')
    expect(renderDocPdf).toHaveBeenCalled()
  })

  it('pdfHandler maps validation misses to the shared plain-text not-found response', async () => {
    profile.role = 'tutor'
    renderDocPdf.mockRejectedValueOnce(new ValidationError('missing'))
    const GET = pdfHandler('receipt')
    const res = await GET(new Request('http://t/api/receipts/doc/pdf'), {
      params: { id: '550e8400-e29b-41d4-a716-446655440000' },
    })
    expect(res.status).toBe(404)
    await expect(res.text()).resolves.toBe('Not found')
  })
})

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

const resolveDocForViewer: any = vi.fn(async () => ({
  id: 'doc-1',
  number: 'CEA-R-2026-0001',
  voided: false,
  party_id: 'admin-1',
}))
const renderResolvedDocPdf: any = vi.fn(async () => Buffer.from('%PDF-1.4 fake'))
// Digest of the letterhead org_settings bakes into the rendered document. It is part of
// the cache validator, so a letterhead correction invalidates already-fetched PDFs.
const letterheadDigest: any = vi.fn(async () => 'LETTERHEAD1')
vi.mock('@/lib/finance/render', () => ({
  resolveDocForViewer: (...args: any[]) => resolveDocForViewer(...args),
  renderResolvedDocPdf: (...args: any[]) => renderResolvedDocPdf(...args),
  letterheadDigest: (...args: any[]) => letterheadDigest(...args),
  renderDocPdf: vi.fn(),
}))

vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn(async () => {}) }))

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
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
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
      params: Promise.resolve({ id: 'bad' }),
    })
    const json = await res.json()
    expect(res.status).toBe(422)
    expect(json.success).toBe(false)
  })

  it('pdfHandler validates the id, renders on a cache miss, and sets a private ETag + no-cache', async () => {
    profile.role = 'tutor'
    const GET = pdfHandler('receipt')
    const res = await GET(new Request('http://t/api/receipts/doc/pdf'), {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    expect(res.status).toBe(200)
    expect(validateFinanceDocId).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000')
    expect(renderResolvedDocPdf).toHaveBeenCalled()
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('etag')).toBe('"receipt-doc-1-live-LETTERHEAD1"')
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
  })

  it('pdfHandler answers 304 WITHOUT rendering when If-None-Match matches the ETag', async () => {
    profile.role = 'tutor'
    const GET = pdfHandler('receipt')
    const res = await GET(
      new Request('http://t/api/receipts/doc/pdf', {
        headers: { 'if-none-match': '"receipt-doc-1-live-LETTERHEAD1"' },
      }),
      { params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }) },
    )
    expect(res.status).toBe(304)
    expect(renderResolvedDocPdf).not.toHaveBeenCalled()
    expect(res.headers.get('etag')).toBe('"receipt-doc-1-live-LETTERHEAD1"')
  })

  it('pdfHandler re-renders after a void (ETag flips) instead of serving the stale cached copy', async () => {
    profile.role = 'tutor'
    resolveDocForViewer.mockResolvedValueOnce({
      id: 'doc-1',
      number: 'CEA-R-2026-0001',
      voided: true,
      party_id: 'admin-1',
    })
    const GET = pdfHandler('receipt')
    // Client still presents the pre-void validator; it must NOT satisfy the request.
    const res = await GET(
      new Request('http://t/api/receipts/doc/pdf', {
        headers: { 'if-none-match': '"receipt-doc-1-live-LETTERHEAD1"' },
      }),
      { params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }) },
    )
    expect(res.status).toBe(200)
    expect(renderResolvedDocPdf).toHaveBeenCalled()
    expect(res.headers.get('etag')).toBe('"receipt-doc-1-void-LETTERHEAD1"')
    // Not `immutable`: voiding is terminal for the RECORD, but the letterhead can still
    // change afterwards, and immutable told the browser not to revalidate for a year.
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
  })

  it('pdfHandler returns 404 and never renders when the viewer is not authorized for the document', async () => {
    profile.role = 'tutor'
    resolveDocForViewer.mockResolvedValueOnce(null)
    const GET = pdfHandler('receipt')
    const res = await GET(new Request('http://t/api/receipts/doc/pdf'), {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    expect(res.status).toBe(404)
    expect(renderResolvedDocPdf).not.toHaveBeenCalled()
  })

  it('pdfHandler maps an invalid document id to the shared plain-text not-found response', async () => {
    profile.role = 'tutor'
    validateFinanceDocId.mockImplementationOnce(() => {
      throw new ValidationError('Invalid finance document id')
    })
    const GET = pdfHandler('receipt')
    const res = await GET(new Request('http://t/api/receipts/bad/pdf'), {
      params: Promise.resolve({ id: 'bad' }),
    })
    expect(res.status).toBe(404)
    await expect(res.text()).resolves.toBe('Not found')
  })
})

describe('finance PDF cache validator - the letterhead is part of it', () => {
  it('re-renders when the letterhead changed, instead of 304-ing the old bank details', async () => {
    // org_settings is read at RENDER time and baked into every receipt/pay slip, but it is
    // not part of the document record. With an id+voided-only ETag, correcting the bank
    // account left every already-fetched PDF revalidating to a 304 and showing the OLD
    // details indefinitely. The client here presents the pre-correction validator.
    profile.role = 'tutor'
    letterheadDigest.mockResolvedValueOnce('LETTERHEAD2')
    const GET = pdfHandler('receipt')
    const res = await GET(
      new Request('http://t/api/receipts/doc/pdf', {
        headers: { 'if-none-match': '"receipt-doc-1-live-LETTERHEAD1"' },
      }),
      { params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }) },
    )
    expect(res.status).toBe(200)
    expect(renderResolvedDocPdf).toHaveBeenCalled()
    expect(res.headers.get('etag')).toBe('"receipt-doc-1-live-LETTERHEAD2"')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Exercises the PDF-generation PIPELINE end to end in CI - line-item + org fetch,
// template build, VOID stamping, and the handoff to htmlToPdf - with only the
// headless-Chromium byte step (a trusted library boundary that the mock renderer
// deliberately requires a real browser for) mocked out. This is the automated
// coverage the live route can't give without a real session + a browser.

const getDocLines = vi.fn(async (..._a: unknown[]) => [{ label: 'Tuition (July)', hours: 1, rate: 1000, amount: 1000 }])
vi.mock('@/lib/services/finance/finance-docs', () => ({
  getDoc: vi.fn(),
  getDocLines: (...a: any[]) => getDocLines(...a),
}))

const org = {
  institute_name: 'Cert-Ed Academia',
  contact_email: 'office@certedacademia.com',
  contact_phone: '000',
  bank_account: '123',
  bank_ifsc: 'IFSC0001',
  bank_branch: 'Main',
  terms_text: 'Terms apply.',
  signatory_name: 'Principal',
  signatory_title: 'Head',
  signature_text: 'Digitally signed by',
}
vi.mock('@/lib/services/finance/org-settings', () => ({ getOrgSettings: vi.fn(async () => org) }))

let capturedHtml = ''
vi.mock('@/lib/pdf/render-pdf', () => ({
  htmlToPdf: vi.fn(async (html: string) => {
    capturedHtml = html
    return Buffer.from('%PDF-1.4 rendered')
  }),
}))

import { renderResolvedDocPdf } from '@/lib/finance/render'

const baseDoc = {
  id: 'doc-1',
  number: 'CEA-R-2026-0001',
  issue_date: '2026-07-16',
  party_name: 'Asha Rao',
  class_level: 'Grade 10',
  currency: 'INR',
  subtotal: 1000,
  discount: 0,
  total: 1000,
  note: null,
  voided: false,
  party_id: 'p1',
} as any

beforeEach(() => {
  vi.clearAllMocks()
  capturedHtml = ''
})

describe('renderResolvedDocPdf - PDF generation pipeline', () => {
  it('assembles the receipt HTML with the document content and hands it to htmlToPdf', async () => {
    const pdf = await renderResolvedDocPdf('receipt', baseDoc)
    expect(getDocLines).toHaveBeenCalledWith('receipt', 'doc-1')
    expect(capturedHtml).toContain('CEA-R-2026-0001')
    expect(capturedHtml).toContain('Asha Rao')
    expect(capturedHtml).not.toContain('VOID')
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('stamps the VOID watermark into the HTML for a voided document', async () => {
    await renderResolvedDocPdf('receipt', { ...baseDoc, voided: true })
    expect(capturedHtml).toContain('VOID')
  })
})

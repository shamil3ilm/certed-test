import { describe, it, expect } from 'vitest'
import { buildReceiptHtml, buildPayslipHtml, type FinanceDoc, type OrgInfo } from '@/lib/pdf/template'

const assets = { louisGeorge: 'AAA', daggerSquare: 'BBB', logo: 'CCC' }

const org: OrgInfo = {
  instituteName: 'Cert-Ed Academia',
  email: 'info@certedacademia.com',
  bankAccount: '0488053000009258',
  bankIfsc: 'SIBL0000488',
  bankBranch: 'KOORKANCHERY',
  terms: 'Please pay within 5 days.',
  signatoryName: 'Mohamed Shahzad',
  signatoryTitle: 'CEO',
  signatureText: 'Digitally signed by',
}

const doc: FinanceDoc = {
  number: 'CEA-R-2026-0007',
  issueDate: '02 Jun 2026',
  partyName: 'Aadhya',
  classLevel: '5',
  currency: 'INR',
  lines: [{ label: 'Maths', hours: 7.5, rate: 200, amount: 1500 }],
  subtotal: 1500,
  total: 1500,
}

describe('buildReceiptHtml', () => {
  const html = buildReceiptHtml(doc, org, assets)
  it('includes the number, party, line, and total', () => {
    expect(html).toContain('CEA-R-2026-0007')
    expect(html).toContain('Aadhya')
    expect(html).toContain('Maths')
    expect(html).toContain('1,500')
  })
  it('shows STUDENT + class and the signatory', () => {
    expect(html).toContain('STUDENT')
    expect(html).toContain('Class 5')
    expect(html).toContain('Mohamed Shahzad')
  })
  it('inlines the brand fonts + logo + terms', () => {
    expect(html).toContain('AAA') // louis george font
    expect(html).toContain('CCC') // logo
    expect(html).toContain('Please pay within 5 days.')
  })
})

describe('buildPayslipHtml', () => {
  const html = buildPayslipHtml({ ...doc, number: 'CEA-P-2026-0003', partyName: 'Ravi' }, org, assets)
  it('uses TEACHER and omits the class line', () => {
    expect(html).toContain('TEACHER')
    expect(html).toContain('Ravi')
    expect(html).not.toContain('Class 5')
  })
})

describe('VOID badge', () => {
  it('appears only when voided', () => {
    expect(buildReceiptHtml(doc, org, assets)).not.toContain('>VOID<')
    expect(buildReceiptHtml({ ...doc, voided: true }, org, assets)).toContain('VOID')
  })
})

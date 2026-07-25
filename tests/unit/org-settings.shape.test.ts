import { describe, it, expect } from 'vitest'
import { receiptNumber } from '@/lib/services/finance/org-settings'

describe('receiptNumber', () => {
  it('formats prefix-year-padded', () => {
    expect(receiptNumber('CEA-R', 2026, 7)).toBe('CEA-R-2026-0007')
  })
  it('pads to four digits and keeps larger numbers intact', () => {
    expect(receiptNumber('CEA-P', 2026, 1)).toBe('CEA-P-2026-0001')
    expect(receiptNumber('CEA-R', 2027, 12345)).toBe('CEA-R-2027-12345')
  })
})

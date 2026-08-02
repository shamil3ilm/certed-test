import { describe, it, expect } from 'vitest'
import { formatMark } from '@/lib/grades'

describe('formatMark', () => {
  it('shows score, max, and rounded percentage when a max is known', () => {
    expect(formatMark(17, 20)).toBe('17 / 20 (85%)')
    expect(formatMark(20, 20)).toBe('20 / 20 (100%)')
  })

  it('shows only the raw score when there is no usable max', () => {
    expect(formatMark(17, null)).toBe('17')
    expect(formatMark(17, undefined)).toBe('17')
    expect(formatMark(0, 0)).toBe('0') // guard against divide-by-zero
  })

  it('clamps the percentage to 100 when the score exceeds a lowered max', () => {
    expect(formatMark(25, 20)).toBe('25 / 20 (100%)')
  })
})

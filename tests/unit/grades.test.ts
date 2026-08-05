import { describe, it, expect } from 'vitest'
import { formatMark, markPercent, weightedAveragePercent } from '@/lib/grades'

describe('markPercent', () => {
  it('returns a rounded percentage when a positive maximum exists', () => {
    expect(markPercent(17, 20)).toBe(85)
    expect(markPercent(2, 3)).toBe(67)
  })

  it('returns null when there is no usable maximum and clamps lowered-max cases to 100', () => {
    expect(markPercent(17, null)).toBeNull()
    expect(markPercent(17, 0)).toBeNull()
    expect(markPercent(25, 20)).toBe(100)
  })
})

describe('weightedAveragePercent', () => {
  it('computes a points-weighted percentage instead of a simple mean of item percentages', () => {
    expect(
      weightedAveragePercent([
        { score: 8, maxMarks: 10 },
        { score: 40, maxMarks: 50 },
      ]),
    ).toBe(80)
  })

  it('ignores non-percentage items and returns null when nothing is weightable', () => {
    expect(
      weightedAveragePercent([
        { score: 40, maxMarks: null },
        { score: 0, maxMarks: 0 },
      ]),
    ).toBeNull()
  })

  it('clamps each item before weighting, so lowered maxima cannot push the average above 100', () => {
    expect(weightedAveragePercent([{ score: 25, maxMarks: 20 }])).toBe(100)
  })
})

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

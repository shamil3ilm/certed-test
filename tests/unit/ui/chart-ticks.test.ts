import { describe, it, expect } from 'vitest'
import { tickIndices } from '@/lib/ui/charts'

// Guards the dashboard Insights axis: labels must be evenly spaced. The old
// round-based thinning produced adjacent labels in the MIDDLE of the axis
// (n=8,max=5 -> [0,2,4,5,7], so "13 Jul" and "20 Jul" sat one bucket apart while
// the rest were two apart). Every interior gap should now be equal; only the very
// last label may hug the latest point.
describe('tickIndices (Insights axis thinning)', () => {
  it('keeps every index when there are at most `max` buckets', () => {
    expect(tickIndices(4, 5)).toEqual([0, 1, 2, 3])
    expect(tickIndices(5, 5)).toEqual([0, 1, 2, 3, 4])
  })

  it('fixes the n=8 regression (was [0,2,4,5,7])', () => {
    expect(tickIndices(8, 5)).toEqual([0, 2, 4, 6, 7])
  })

  it('always includes the first and last bucket, sorted and unique', () => {
    for (let n = 6; n <= 40; n++) {
      const t = tickIndices(n, 5)
      expect(t[0]).toBe(0)
      expect(t[t.length - 1]).toBe(n - 1)
      expect([...t]).toEqual([...new Set(t)].sort((a, b) => a - b))
    }
  })

  it('spaces interior ticks by more than one bucket (no crammed labels)', () => {
    for (let n = 6; n <= 40; n++) {
      const t = tickIndices(n, 5)
      // Exclude the final gap, which may hug the latest point by design.
      for (let i = 1; i < t.length - 1; i++) {
        expect(t[i] - t[i - 1]).toBeGreaterThan(1)
      }
    }
  })
})

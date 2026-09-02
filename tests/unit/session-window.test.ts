import { describe, it, expect } from 'vitest'
import { resolveSessionWindow } from '@/lib/attendance/session-window'
import { ValidationError } from '@/lib/errors'

const D = (s: string) => `2026-08-05T${s}:00.000Z`

describe('resolveSessionWindow', () => {
  it('passes a normal same-day window through unchanged', () => {
    expect(resolveSessionWindow(D('10:00'), D('11:30'))).toEqual({ start: D('10:00'), end: D('11:30') })
  })

  it('rolls a cross-midnight end to the next day (23:30 -> 00:30)', () => {
    expect(resolveSessionWindow(D('23:30'), D('00:30'))).toEqual({
      start: D('23:30'),
      end: '2026-08-06T00:30:00.000Z',
    })
  })

  it('does NOT roll (and rejects) when the "before" span is too long to be an overnight class', () => {
    // 10:00 start, 09:00 end -> rolled would be 23h > the overnight bound -> left unrolled -> invalid.
    expect(() => resolveSessionWindow(D('10:00'), D('09:00'))).toThrow(ValidationError)
  })

  it('rejects an end equal to the start', () => {
    expect(() => resolveSessionWindow(D('10:00'), D('10:00'))).toThrow(ValidationError)
  })

  it('rejects an end with no start', () => {
    expect(() => resolveSessionWindow(null, D('10:00'))).toThrow(ValidationError)
  })

  it('rejects a window longer than 24 hours', () => {
    expect(() => resolveSessionWindow(D('10:00'), '2026-08-06T11:00:00.000Z')).toThrow(ValidationError)
  })

  it('allows a fully-null window (clearing both times)', () => {
    expect(resolveSessionWindow(null, null)).toEqual({ start: null, end: null })
  })

  it('allows a start with no end (in-progress session)', () => {
    expect(resolveSessionWindow(D('10:00'), null)).toEqual({ start: D('10:00'), end: null })
  })
})

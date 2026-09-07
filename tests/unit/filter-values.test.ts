import { describe, it, expect } from 'vitest'
import { assertFilterSafeId, isFilterSafeInstant } from '@/lib/text/filter-values'

/**
 * `.or()` takes a STRING whose grammar is commas, dots and parentheses. escapeOrIlike
 * handles free text; structured values are validated instead, because a uuid that appears
 * to contain that grammar is a bug rather than something to sanitise - stripping it would
 * turn a broken filter into a silently different one, which is the failure these prevent.
 */

describe('assertFilterSafeId', () => {
  it('accepts a bare uuid', () => {
    expect(() => assertFilterSafeId('11111111-1111-4111-8111-111111111111', 'x')).not.toThrow()
  })

  it.each([
    ['a comma, which would split one clause into two', '1111,2222'],
    ['a parenthesis, which would open nested logic', '1111)'],
    ['a dot, which is the col.op.value separator', 'id.eq.1'],
    ['an injected clause outright', '00000000-0000-4000-8000-000000000000,status.eq.active'],
    ['empty', ''],
  ])('refuses %s', (_why, value) => {
    expect(() => assertFilterSafeId(value, 'x')).toThrow(/non-uuid/)
  })

  it('names where it came from, so the throw is diagnosable', () => {
    expect(() => assertFilterSafeId('nope', 'menteeNotes.visibility.authorId')).toThrow(
      /menteeNotes\.visibility\.authorId/,
    )
  })
})

describe('isFilterSafeInstant', () => {
  it.each(['2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00Z', '2026-06-01 00:00:00+05:30'])(
    'accepts the instant shape %s',
    (v) => expect(isFilterSafeInstant(v)).toBe(true),
  )

  it.each([
    ['null - no resolved tenure', null],
    ['a comma', '2026-06-01T00:00:00Z,status.eq.active'],
    ['free text', 'yesterday'],
    ['a bare date', '2026-06-01'],
  ])('rejects %s so the caller fails CLOSED', (_why, v) => {
    expect(isFilterSafeInstant(v as string | null)).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { siblingHref } from '@/app/(prt)/classroom/[id]/sibling-href'

/**
 * Switching subject must keep the reader where they were. Landing them on the stream from
 * Attendance is the failure this is written against: it makes the switcher slower than
 * going back to the list, which is the thing it replaces.
 */
describe('siblingHref', () => {
  it('keeps the sub-page when switching class', () => {
    expect(siblingHref('/classroom/a/attendance', 'a', 'b')).toBe('/classroom/b/attendance')
    expect(siblingHref('/classroom/a/classwork', 'a', 'b')).toBe('/classroom/b/classwork')
    expect(siblingHref('/classroom/a/people', 'a', 'b')).toBe('/classroom/b/people')
  })

  it('keeps a deeper sub-page too', () => {
    expect(siblingHref('/classroom/a/classwork/x', 'a', 'b')).toBe('/classroom/b/classwork/x')
  })

  it('handles the class root', () => {
    expect(siblingHref('/classroom/a', 'a', 'b')).toBe('/classroom/b')
  })

  it('falls back to the class root for a path that is not this class', () => {
    expect(siblingHref('/dashboard', 'a', 'b')).toBe('/classroom/b')
  })

  it('does not rewrite a DIFFERENT class whose id merely starts the same way', () => {
    // '/classroom/abc' starts with '/classroom/a' as a string; treating that as a match
    // would send the reader to '/classroom/b' + 'bc'.
    expect(siblingHref('/classroom/abc/people', 'a', 'b')).toBe('/classroom/b')
  })
})

describe('siblingHref carries the query', () => {
  it('keeps the date when switching subject from Attendance', () => {
    // The case this exists for: a tutor comparing Monday across two subjects. Dropping the
    // query lands them on today - same subject, silently a different day.
    expect(siblingHref('/classroom/A/attendance', 'A', 'B', '?date=2026-09-06')).toBe(
      '/classroom/B/attendance?date=2026-09-06',
    )
  })

  it('accepts a bare query string as well as one with the ?', () => {
    // useSearchParams().toString() yields no leading "?".
    expect(siblingHref('/classroom/A/attendance', 'A', 'B', 'date=2026-09-06')).toBe(
      '/classroom/B/attendance?date=2026-09-06',
    )
  })

  it('adds no stray ? when there is no query', () => {
    expect(siblingHref('/classroom/A/attendance', 'A', 'B')).toBe('/classroom/B/attendance')
    expect(siblingHref('/classroom/A/attendance', 'A', 'B', '?')).toBe('/classroom/B/attendance')
  })
})

import { describe, it, expect } from 'vitest'
import { pageSlice, parsePageParam, totalPages } from '@/lib/pagination'

describe('parsePageParam', () => {
  it('defaults to 1 for missing / empty / non-numeric input', () => {
    expect(parsePageParam(undefined)).toBe(1)
    expect(parsePageParam(null)).toBe(1)
    expect(parsePageParam('')).toBe(1)
    expect(parsePageParam('abc')).toBe(1)
  })

  it('never returns below 1 (zero, negative)', () => {
    expect(parsePageParam('0')).toBe(1)
    expect(parsePageParam('-5')).toBe(1)
  })

  it('parses a valid 1-based page number', () => {
    expect(parsePageParam('1')).toBe(1)
    expect(parsePageParam('3')).toBe(3)
    expect(parsePageParam('42')).toBe(42)
  })
})

describe('totalPages', () => {
  it('is at least 1 even with zero rows, so "Page 1 of 1" holds', () => {
    expect(totalPages(0, 10)).toBe(1)
  })

  it('rounds a partial last page up', () => {
    expect(totalPages(1, 10)).toBe(1)
    expect(totalPages(10, 10)).toBe(1)
    expect(totalPages(11, 10)).toBe(2)
    expect(totalPages(21, 10)).toBe(3)
  })
})

describe('pageSlice', () => {
  const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

  it('returns the first page from the start of the array', () => {
    expect(pageSlice(items, 1, 4)).toEqual([0, 1, 2, 3])
  })

  it('offsets a middle page by (page - 1) * pageSize', () => {
    expect(pageSlice(items, 2, 4)).toEqual([4, 5, 6, 7])
  })

  it('returns only the remainder on a partial last page', () => {
    expect(pageSlice(items, 3, 4)).toEqual([8, 9])
  })

  it('is empty for a page beyond the end (never wraps)', () => {
    expect(pageSlice(items, 4, 4)).toEqual([])
    expect(pageSlice([], 1, 20)).toEqual([])
  })

  it('returns the whole set when it fits on one page', () => {
    expect(pageSlice(items, 1, 20)).toEqual(items)
  })
})

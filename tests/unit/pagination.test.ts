import { describe, it, expect } from 'vitest'
import { parsePageParam, totalPages } from '@/lib/pagination'

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

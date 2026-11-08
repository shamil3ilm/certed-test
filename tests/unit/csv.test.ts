import { describe, expect, it } from 'vitest'
import { escapeCsvField, toCsvRow } from '@/lib/csv'

describe('escapeCsvField', () => {
  it('escapes standard strings without special characters directly', () => {
    expect(escapeCsvField('Maths')).toBe('Maths')
    expect(escapeCsvField(120)).toBe('120')
  })

  it('quotes fields with commas, quotes, or newlines', () => {
    expect(escapeCsvField('Smith, John')).toBe('"Smith, John"')
    expect(escapeCsvField('Say "hello"')).toBe('"Say ""hello"""')
    expect(escapeCsvField('line 1\nline 2')).toBe('"line 1\nline 2"')
  })

  it('neutralizes spreadsheet formula injection with leading single quote', () => {
    expect(escapeCsvField('=SUM(A1:A10)')).toBe(`'=SUM(A1:A10)`)
    expect(escapeCsvField('+12345')).toBe(`'+12345`)
    expect(escapeCsvField('-negative')).toBe(`'-negative`)
    expect(escapeCsvField('@mention')).toBe(`'@mention`)
    expect(escapeCsvField('=SUM(A1, B1)')).toBe(`"'=SUM(A1, B1)"`)
  })

  it('handles null and undefined gracefully', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })
})

describe('toCsvRow', () => {
  it('joins escaped columns with commas', () => {
    expect(toCsvRow(['Tutor', 10, 'Maths, Science'])).toBe('Tutor,10,"Maths, Science"')
  })
})

import { describe, it, expect } from 'vitest'
import { parsePickerDoc } from '@/lib/google/picker-result'

describe('parsePickerDoc', () => {
  it('returns null for null/undefined', () => {
    expect(parsePickerDoc(null)).toBeNull()
    expect(parsePickerDoc(undefined)).toBeNull()
  })

  it('returns null when id or url is missing', () => {
    expect(parsePickerDoc({ id: 'x' })).toBeNull()
    expect(parsePickerDoc({ url: 'https://drive.google.com/file/d/x/view' })).toBeNull()
  })

  it('parses a full doc', () => {
    expect(
      parsePickerDoc({
        id: 'abc',
        url: 'https://drive.google.com/file/d/abc/view',
        name: 'ch4.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
      }),
    ).toEqual({
      id: 'abc',
      url: 'https://drive.google.com/file/d/abc/view',
      name: 'ch4.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1234,
    })
  })

  it('coerces a string sizeBytes and defaults a blank name', () => {
    const r = parsePickerDoc({ id: 'a', url: 'u', sizeBytes: '999' })
    expect(r?.sizeBytes).toBe(999)
    expect(r?.name).toBe('Untitled')
  })

  it('sets sizeBytes null when absent or unparseable', () => {
    expect(parsePickerDoc({ id: 'a', url: 'u' })?.sizeBytes).toBeNull()
    expect(parsePickerDoc({ id: 'a', url: 'u', sizeBytes: 'nope' })?.sizeBytes).toBeNull()
  })
})

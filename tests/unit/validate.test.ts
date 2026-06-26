import { describe, it, expect } from 'vitest'
import { decideFinalize, isAllowedType, MAX_UPLOAD_BYTES } from '@/lib/drive/validate'

describe('decideFinalize', () => {
  it('accepts an allowed type within size', () => {
    expect(decideFinalize({ size: 1024, mimeType: 'application/pdf' })).toEqual({ ok: true })
  })
  it('rejects a disallowed type', () => {
    expect(decideFinalize({ size: 1024, mimeType: 'application/x-msdownload' })).toEqual({
      ok: false,
      reason: 'type-not-allowed',
    })
  })
  it('rejects an empty file', () => {
    expect(decideFinalize({ size: 0, mimeType: 'application/pdf' })).toEqual({
      ok: false,
      reason: 'empty',
    })
  })
  it('rejects an oversized file', () => {
    expect(decideFinalize({ size: MAX_UPLOAD_BYTES + 1, mimeType: 'application/pdf' })).toEqual({
      ok: false,
      reason: 'too-large',
    })
  })
})

describe('isAllowedType', () => {
  it('allows png, rejects exe', () => {
    expect(isAllowedType('image/png')).toBe(true)
    expect(isAllowedType('application/x-msdownload')).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { isAppPath, safeActionHref, safeExternalHref } from '@/lib/validation/url'

/**
 * ExternalActionLink renders "Open" on class documents and "Download" on receipts and pay slips,
 * both of which point at this app's own routes. The guard has to let those through - otherwise
 * the control renders as inert text - while still refusing every value that could navigate
 * somewhere else or run script.
 */
describe('safeActionHref', () => {
  it("accepts this app's download and PDF routes", () => {
    expect(safeActionHref('/api/resources/11111111-1111-4111-8111-111111111111/download')).toBe(
      '/api/resources/11111111-1111-4111-8111-111111111111/download',
    )
    expect(safeActionHref('/api/receipts/abc/pdf')).toBe('/api/receipts/abc/pdf')
  })

  it('accepts http(s) links', () => {
    expect(safeActionHref('https://drive.google.com/file/d/x/view')).toBe('https://drive.google.com/file/d/x/view')
  })

  it('refuses values a browser resolves to another origin', () => {
    expect(safeActionHref('//evil.example/x')).toBeNull()
    expect(safeActionHref('/\\evil.example/x')).toBeNull()
    // Browsers strip tabs and newlines, which would turn these into "//evil.example".
    expect(safeActionHref('/\t/evil.example')).toBeNull()
    expect(safeActionHref('/\n/evil.example')).toBeNull()
  })

  it('refuses script schemes, bare fragments and relative paths', () => {
    expect(safeActionHref('javascript:alert(1)')).toBeNull()
    expect(safeActionHref('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeActionHref('#')).toBeNull()
    expect(safeActionHref('api/resources/x')).toBeNull()
    expect(safeActionHref('')).toBeNull()
    expect(safeActionHref(null)).toBeNull()
  })
})

describe('isAppPath', () => {
  it('is only a single leading slash followed by no whitespace', () => {
    expect(isAppPath('/')).toBe(true)
    expect(isAppPath('/classroom/1/classwork#materials')).toBe(true)
    expect(isAppPath('//x')).toBe(false)
    expect(isAppPath('/a b')).toBe(false)
  })
})

describe('safeExternalHref stays external-only', () => {
  it('still refuses app paths, for callers that must only ever link out', () => {
    expect(safeExternalHref('/api/resources/x/download')).toBeNull()
  })
})

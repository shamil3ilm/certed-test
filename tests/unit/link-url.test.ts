import { describe, it, expect } from 'vitest'
import { linkUrl } from '@/lib/validation/url'

describe('linkUrl', () => {
  it('accepts https and http links', () => {
    expect(linkUrl.safeParse('https://drive.google.com/file/d/x/view').success).toBe(true)
    expect(linkUrl.safeParse('http://example.com/a').success).toBe(true)
  })

  it('rejects dangerous schemes (stored-XSS vectors)', () => {
    expect(linkUrl.safeParse('javascript:alert(1)').success).toBe(false)
    expect(linkUrl.safeParse('data:text/html,<script>alert(1)</script>').success).toBe(false)
    expect(linkUrl.safeParse('vbscript:msgbox(1)').success).toBe(false)
  })

  it('rejects non-urls and overly long input', () => {
    expect(linkUrl.safeParse('not a url').success).toBe(false)
    expect(linkUrl.safeParse('https://x.test/' + 'a'.repeat(2050)).success).toBe(false)
  })

  it('trims surrounding whitespace', () => {
    expect(linkUrl.safeParse('  https://x.test/a  ').success).toBe(true)
  })
})

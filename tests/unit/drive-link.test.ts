import { describe, it, expect } from 'vitest'
import { checkDriveLink, isAllowedDriveUrl } from '@/lib/drive-link'

describe('checkDriveLink', () => {
  it('stays quiet on empty / whitespace input', () => {
    expect(checkDriveLink('')).toBe('ok')
    expect(checkDriveLink('   ')).toBe('ok')
  })

  it('stays quiet on a malformed URL (handled elsewhere)', () => {
    expect(checkDriveLink('not a url')).toBe('ok')
  })

  it('accepts a shared Drive file link', () => {
    expect(checkDriveLink('https://drive.google.com/file/d/abc123/view?usp=sharing')).toBe('ok')
    expect(checkDriveLink('https://drive.google.com/open?id=abc123')).toBe('ok')
  })

  it('ignores a leading www.', () => {
    expect(checkDriveLink('https://www.drive.google.com/file/d/abc/view')).toBe('ok')
  })

  it('accepts Google Docs / Sheets / Slides links', () => {
    expect(checkDriveLink('https://docs.google.com/document/d/abc/edit')).toBe('ok')
  })

  it('flags a Drive folder link', () => {
    expect(checkDriveLink('https://drive.google.com/drive/folders/xyz789')).toBe('folder')
  })

  it('flags a non-Google link', () => {
    expect(checkDriveLink('https://onedrive.live.com/whatever')).toBe('not-drive')
    expect(checkDriveLink('https://youtu.be/abc')).toBe('not-drive')
    expect(checkDriveLink('https://example.com/file.pdf')).toBe('not-drive')
  })
})

describe('isAllowedDriveUrl (hard allowlist)', () => {
  it('allows Drive and Docs hosts, including a leading www.', () => {
    expect(isAllowedDriveUrl('https://drive.google.com/file/d/abc/view')).toBe(true)
    expect(isAllowedDriveUrl('https://docs.google.com/document/d/abc/edit')).toBe(true)
    expect(isAllowedDriveUrl('https://www.drive.google.com/open?id=abc')).toBe(true)
    // A folder link is still a Drive host - the soft nudge flags it, the hard gate allows it.
    expect(isAllowedDriveUrl('https://drive.google.com/drive/folders/xyz')).toBe(true)
  })

  it('rejects any other host, so the download route cannot redirect off-Drive', () => {
    expect(isAllowedDriveUrl('https://evil.example.com/phish')).toBe(false)
    expect(isAllowedDriveUrl('https://onedrive.live.com/x')).toBe(false)
    // A look-alike subdomain must not slip through the exact-host check.
    expect(isAllowedDriveUrl('https://drive.google.com.evil.com/x')).toBe(false)
  })

  it('rejects malformed and non-http(s) URLs', () => {
    expect(isAllowedDriveUrl('not a url')).toBe(false)
    expect(isAllowedDriveUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedDriveUrl('')).toBe(false)
  })
})

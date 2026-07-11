import { describe, it, expect } from 'vitest'
import { checkDriveLink } from '@/lib/driveLink'

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

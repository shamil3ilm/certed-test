import { describe, it, expect } from 'vitest'
import { drivePreviewUrl, isImageUrl, isPdfUrl, attachmentKind } from '@/lib/documents/preview'

describe('drivePreviewUrl', () => {
  it('returns null for empty / nullish input', () => {
    expect(drivePreviewUrl(null)).toBeNull()
    expect(drivePreviewUrl(undefined)).toBeNull()
    expect(drivePreviewUrl('')).toBeNull()
  })

  it('maps a Drive file link to its /preview embed', () => {
    expect(drivePreviewUrl('https://drive.google.com/file/d/ABC123/view?usp=sharing')).toBe(
      'https://drive.google.com/file/d/ABC123/preview',
    )
  })

  it('maps each Docs editor kind to its /preview embed', () => {
    expect(drivePreviewUrl('https://docs.google.com/document/d/DOC1/edit')).toBe(
      'https://docs.google.com/document/d/DOC1/preview',
    )
    expect(drivePreviewUrl('https://docs.google.com/spreadsheets/d/SHEET1/edit#gid=0')).toBe(
      'https://docs.google.com/spreadsheets/d/SHEET1/preview',
    )
    expect(drivePreviewUrl('https://docs.google.com/presentation/d/SLIDE1/edit')).toBe(
      'https://docs.google.com/presentation/d/SLIDE1/preview',
    )
  })

  it('returns null for a non-embeddable / non-Google link', () => {
    expect(drivePreviewUrl('https://example.com/report.docx')).toBeNull()
    expect(drivePreviewUrl('https://drive.google.com/drive/folders/FOLDER1')).toBeNull()
  })
})

describe('isImageUrl / isPdfUrl', () => {
  it('detects image extensions, including with a query or hash', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']) {
      expect(isImageUrl(`https://x/y.${ext}`)).toBe(true)
    }
    expect(isImageUrl('https://x/y.PNG?token=1')).toBe(true)
    expect(isImageUrl('https://x/y.jpg#frag')).toBe(true)
    expect(isImageUrl('https://x/y.txt')).toBe(false)
    expect(isImageUrl('https://x/pngbanner')).toBe(false)
  })

  it('detects pdf, including with a query or hash', () => {
    expect(isPdfUrl('https://x/y.pdf')).toBe(true)
    expect(isPdfUrl('https://x/y.PDF?v=2')).toBe(true)
    expect(isPdfUrl('https://x/y.pdf#page=3')).toBe(true)
    expect(isPdfUrl('https://x/y.pdfx')).toBe(false)
    expect(isPdfUrl('https://x/y.doc')).toBe(false)
  })
})

describe('attachmentKind', () => {
  it('classifies image, embeddable preview (Drive/Docs/PDF), and plain link', () => {
    expect(attachmentKind('https://x/y.png')).toBe('image')
    expect(attachmentKind('https://drive.google.com/file/d/ABC/view')).toBe('preview')
    expect(attachmentKind('https://docs.google.com/document/d/DOC/edit')).toBe('preview')
    expect(attachmentKind('https://x/y.pdf')).toBe('preview')
    expect(attachmentKind('https://example.com/page')).toBe('link')
  })
})

import { describe, it, expect } from 'vitest'
import { validateAttachment, sanitizeFilename, MAX_ATTACHMENT_BYTES } from '@/lib/attachments/validation'
import { ValidationError } from '@/lib/errors'

const pdfHead = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]) // %PDF-1.7
const pngHead = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const zipHead = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]) // PK.. (docx/xlsx/pptx/zip)
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

describe('validateAttachment', () => {
  it('accepts a real PDF and returns the sanitized shape', () => {
    expect(
      validateAttachment({ filename: 'Essay.pdf', mimeType: 'application/pdf', size: 1000, head: pdfHead }),
    ).toEqual({ sanitizedFilename: 'Essay.pdf', extension: 'pdf', mimeType: 'application/pdf', size: 1000 })
  })

  it('accepts a docx by its zip signature', () => {
    const r = validateAttachment({ filename: 'report.docx', mimeType: DOCX_MIME, size: 500, head: zipHead })
    expect(r.extension).toBe('docx')
  })

  it('rejects an empty file', () => {
    expect(() =>
      validateAttachment({ filename: 'a.pdf', mimeType: 'application/pdf', size: 0, head: pdfHead }),
    ).toThrow(ValidationError)
  })

  it('rejects a file over the 25 MB cap', () => {
    expect(() =>
      validateAttachment({
        filename: 'a.pdf',
        mimeType: 'application/pdf',
        size: MAX_ATTACHMENT_BYTES + 1,
        head: pdfHead,
      }),
    ).toThrow(/25 MB/)
  })

  it('rejects a disallowed extension', () => {
    expect(() =>
      validateAttachment({ filename: 'a.exe', mimeType: 'application/pdf', size: 10, head: pdfHead }),
    ).toThrow(ValidationError)
  })

  it('rejects a MIME that does not match the extension', () => {
    expect(() => validateAttachment({ filename: 'a.pdf', mimeType: 'image/png', size: 10, head: pdfHead })).toThrow(
      /doesn't match/,
    )
  })

  it('rejects content whose magic bytes contradict the claimed type', () => {
    // A PNG body wearing a .pdf name + application/pdf type.
    expect(() =>
      validateAttachment({ filename: 'a.pdf', mimeType: 'application/pdf', size: 10, head: pngHead }),
    ).toThrow(/contents/)
  })
})

describe('sanitizeFilename', () => {
  it('strips path components, keeping only the basename', () => {
    expect(sanitizeFilename('..\\..\\etc\\evil.pdf').name).toBe('evil.pdf')
    expect(sanitizeFilename('/var/tmp/notes.png').name).toBe('notes.png')
  })

  it('rejects a leading-dot (hidden) name', () => {
    expect(() => sanitizeFilename('.secret.pdf')).toThrow(ValidationError)
  })

  it('rejects a masked second extension (cv.exe.pdf)', () => {
    expect(() => sanitizeFilename('cv.exe.pdf')).toThrow(ValidationError)
  })

  it('rejects a disallowed final extension (cv.pdf.exe)', () => {
    expect(() => sanitizeFilename('cv.pdf.exe')).toThrow(ValidationError)
  })

  it('NFC-normalizes combining characters', () => {
    // "e" + combining acute -> "é"
    expect(sanitizeFilename('résumé.pdf').name).toBe('résumé.pdf')
  })

  it('caps the length while preserving the extension', () => {
    const long = `${'a'.repeat(500)}.pdf`
    const out = sanitizeFilename(long)
    expect(out.name.length).toBeLessThanOrEqual(200)
    expect(out.name.endsWith('.pdf')).toBe(true)
  })
})

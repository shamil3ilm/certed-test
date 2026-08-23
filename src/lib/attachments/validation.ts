import { ValidationError } from '@/lib/errors'

/**
 * Upload validation for custodial attachments. Pure and server/client-safe (no
 * 'server-only'): the client does a fast pre-check for a friendly early error, and
 * the upload route re-runs the SAME checks authoritatively before a byte reaches
 * Drive. Never trust the browser's pre-check.
 *
 * Defence is layered: an extension allowlist, a MIME allowlist cross-checked
 * against the extension, and a magic-byte sniff - so a file must have an allowed
 * name, claim an allowed type, AND actually be that type. Filename sanitization
 * then strips anything that could traverse a path or mask a second extension.
 */

/** 25 MB - matches the attachments_size_check constraint in migration 0057. */
export const MAX_ATTACHMENT_BYTES = 26_214_400

/**
 * Max ACTIVE attachments per owner - a guardrail against runaway/spam uploads,
 * enforced server-side in the attach guard. Applies to submission / assignment /
 * announcement (purely additive owners). RESOURCES are exempt: replacing a document
 * supersedes its prior file (active stays 1), so a count cap would wrongly freeze a
 * document after N revisions.
 */
export const MAX_ATTACHMENTS_PER_OWNER = 5

/** Allowed extension -> the MIME types that legitimately carry it. */
const EXTENSION_MIME: Record<string, readonly string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  zip: ['application/zip', 'application/x-zip-compressed'],
}

type Signature = readonly number[]
const PDF: Signature = [0x25, 0x50, 0x44, 0x46] // %PDF
const PNG: Signature = [0x89, 0x50, 0x4e, 0x47]
const JPG: Signature = [0xff, 0xd8, 0xff]
const ZIP: Signature = [0x50, 0x4b, 0x03, 0x04] // PK.. (also docx/xlsx/pptx, which are zip)
const ZIP_EMPTY: Signature = [0x50, 0x4b, 0x05, 0x06]
const OLE: Signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] // legacy Office compound file

/** Allowed extension -> the leading byte signatures that prove its real type. */
const EXTENSION_MAGIC: Record<string, readonly Signature[]> = {
  pdf: [PDF],
  png: [PNG],
  jpg: [JPG],
  jpeg: [JPG],
  zip: [ZIP, ZIP_EMPTY],
  docx: [ZIP, ZIP_EMPTY],
  xlsx: [ZIP, ZIP_EMPTY],
  pptx: [ZIP, ZIP_EMPTY],
  doc: [OLE],
  xls: [OLE],
  ppt: [OLE],
}

/** Second extensions we refuse even when the FINAL one is allowed (e.g. cv.pdf.exe). */
const DANGEROUS_INNER = /\.(exe|bat|cmd|com|scr|msi|dll|sh|bash|ps1|vbs|js|jar|html?|svg|php|py)$/i

const MAX_FILENAME_LENGTH = 200

export type AttachmentInput = {
  filename: string
  mimeType: string
  size: number
  /** The file's leading bytes (>= 8) for the magic-byte sniff. */
  head: Uint8Array
}

export type ValidatedAttachment = {
  sanitizedFilename: string
  extension: string
  mimeType: string
  size: number
}

function startsWithSignature(head: Uint8Array, sig: Signature): boolean {
  if (head.length < sig.length) return false
  for (let i = 0; i < sig.length; i++) if (head[i] !== sig[i]) return false
  return true
}

/**
 * Reduce a user-supplied name to a safe Drive filename: NFC-normalized, path
 * components stripped, control characters removed, no leading dot, exactly one
 * allowed extension, no masked second extension, length-capped. Throws
 * ValidationError with a user-safe message on anything it can't make safe.
 */
export function sanitizeFilename(raw: string): { name: string; extension: string } {
  const normalized = raw.normalize('NFC')
  // Take the basename: everything after the last path separator, either slash.
  const base = normalized.split(/[/\\]/).pop() ?? ''
  // Strip C0 control chars + DEL by code point (avoids a control-byte regex literal).
  const cleaned = Array.from(base)
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0
      return c > 0x1f && c !== 0x7f
    })
    .join('')
    .trim()

  if (!cleaned || cleaned.startsWith('.')) throw new ValidationError('That file name is not allowed.')

  const lastDot = cleaned.lastIndexOf('.')
  if (lastDot <= 0) throw new ValidationError('That file type is not supported.')
  const extension = cleaned.slice(lastDot + 1).toLowerCase()
  const stem = cleaned.slice(0, lastDot)

  if (!(extension in EXTENSION_MIME)) throw new ValidationError('That file type is not supported.')
  if (!stem || DANGEROUS_INNER.test(stem)) throw new ValidationError('That file name is not allowed.')

  // Cap length while preserving the extension.
  const room = MAX_FILENAME_LENGTH - (extension.length + 1)
  const safeStem = stem.length > room ? stem.slice(0, room) : stem
  return { name: `${safeStem}.${extension}`, extension }
}

/**
 * Authoritative upload validation. Returns the sanitized name + extension, or
 * throws ValidationError (mapped to 422 by the route). Order matters: cheapest and
 * least-revealing checks first.
 */
export function validateAttachment(input: AttachmentInput): ValidatedAttachment {
  if (!Number.isFinite(input.size) || input.size <= 0) throw new ValidationError('That file is empty.')
  if (input.size > MAX_ATTACHMENT_BYTES) throw new ValidationError('That file is larger than the 25 MB limit.')

  const { name, extension } = sanitizeFilename(input.filename)

  const allowedMimes = EXTENSION_MIME[extension]
  if (!allowedMimes.includes(input.mimeType)) {
    throw new ValidationError("That file's type doesn't match its extension.")
  }

  const signatures = EXTENSION_MAGIC[extension] ?? []
  if (!signatures.some((sig) => startsWithSignature(input.head, sig))) {
    throw new ValidationError("That file's contents don't match its type.")
  }

  return { sanitizedFilename: name, extension, mimeType: input.mimeType, size: input.size }
}

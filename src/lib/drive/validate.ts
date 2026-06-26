export const ALLOWED_MIME = new Set<string>([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/msword', // .doc
  'application/vnd.ms-powerpoint', // .ppt
  'text/plain',
])

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB

export type FinalizeDecision =
  | { ok: true }
  | { ok: false; reason: 'type-not-allowed' | 'empty' | 'too-large' }

/** Validates a finalized Drive file's metadata (read back from Drive) at finalize. */
export function decideFinalize(meta: { size: number; mimeType: string }): FinalizeDecision {
  if (!ALLOWED_MIME.has(meta.mimeType)) return { ok: false, reason: 'type-not-allowed' }
  if (!Number.isFinite(meta.size) || meta.size <= 0) return { ok: false, reason: 'empty' }
  if (meta.size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too-large' }
  return { ok: true }
}

/** Pre-flight check the client uses before requesting an upload session. */
export function isAllowedType(mimeType: string): boolean {
  return ALLOWED_MIME.has(mimeType)
}

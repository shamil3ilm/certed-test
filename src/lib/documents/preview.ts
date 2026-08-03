/**
 * Presentation helpers for previewing a Google Drive / external link inline
 * (no server imports, so client components can use them). Shared by the document
 * library and announcement attachments.
 */

export type Attachment = { url: string; label?: string }

/** Inline Drive/Docs preview URL, or null when the link can't be embedded. */
export function drivePreviewUrl(link: string | null | undefined): string | null {
  if (!link) return null
  const file = link.match(/drive\.google\.com\/file\/d\/([^/?#]+)/)
  if (file) return `https://drive.google.com/file/d/${file[1]}/preview`
  const doc = link.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([^/?#]+)/)
  if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`
  return null
}

export function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(url)
}

export function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url)
}

export type AttachmentKind = 'image' | 'preview' | 'link'

/** How to render an attachment: inline image, embeddable preview (Drive/Docs/PDF),
 *  or a plain open-link. */
export function attachmentKind(url: string): AttachmentKind {
  if (isImageUrl(url)) return 'image'
  if (drivePreviewUrl(url) || isPdfUrl(url)) return 'preview'
  return 'link'
}

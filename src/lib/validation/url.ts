import { z } from 'zod'

/**
 * A safe external link: a well-formed http(s) URL. Rejects dangerous schemes
 * (javascript:, data:, vbscript:, ...) that `z.string().url()` otherwise accepts -
 * these values are stored and later rendered as `<a href>` and clicked by other
 * users (a student's link is opened by a tutor/admin), so an unrestricted
 * scheme is a stored-XSS / phishing vector.
 */
export const linkUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((v) => isSafeExternalUrl(v), 'Enter a valid http(s) link')

/** True only for a well-formed http(s) URL. Shared by the write-side schema
 *  (linkUrl) and the render-side guard (safeExternalHref) so both reject the
 *  same dangerous schemes. */
export function isSafeExternalUrl(value: string): boolean {
  try {
    const proto = new URL(value.trim()).protocol
    return proto === 'https:' || proto === 'http:'
  } catch {
    return false
  }
}

/**
 * Render-side guard for a stored link. Returns the URL only when it is a safe
 * http(s) address, otherwise `null` so the caller renders no `<a href>` at all.
 * Defense in depth behind the write-side checks (the linkUrl schema and the DB
 * `submissions_drive_link_scheme` constraint): a legacy row written before those
 * guards must still never render `javascript:`/`data:` as a clickable href.
 */
export function safeExternalHref(value: string | null | undefined): string | null {
  if (!value || value === '#') return null
  return isSafeExternalUrl(value) ? value : null
}

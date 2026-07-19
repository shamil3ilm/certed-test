import { z } from 'zod'

/**
 * A safe external link: a well-formed http(s) URL. Rejects dangerous schemes
 * (javascript:, data:, vbscript:, …) that `z.string().url()` otherwise accepts —
 * these values are stored and later rendered as `<a href>` and clicked by other
 * users (a student's link is opened by a tutor/admin), so an unrestricted
 * scheme is a stored-XSS / phishing vector.
 */
export const linkUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((v) => {
    try {
      const proto = new URL(v).protocol
      return proto === 'https:' || proto === 'http:'
    } catch {
      return false
    }
  }, 'Enter a valid http(s) link')

/**
 * Check if a string is a valid drive link (not null, not placeholder).
 * Placeholder '#' is used as a sentinel when no link is provided.
 */
export function isValidDriveLink(url: string | null): boolean {
  return !!url && url !== '#'
}

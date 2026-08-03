/**
 * Classifies a pasted link so the submit / resource forms can show a soft,
 * non-blocking nudge before someone shares a link their audience can't open.
 *
 * A file's Drive *sharing* setting isn't visible from the URL, so this can only
 * flag the shapes that are usually a mistake (a folder link, or a non-Google
 * link) - it never blocks submission, it just prompts a second look.
 */
type DriveLinkCheck = 'ok' | 'folder' | 'not-drive'

/**
 * Hosts a document link may point to. The library's storage model IS Google
 * Drive/Docs, so a document link must resolve to one of these. This is the hard
 * counterpart to checkDriveLink's soft nudge: enforced on the write schema and
 * re-checked at redirect time so /api/resources/{id}/download can never become a
 * same-origin open-redirect gadget to an arbitrary host.
 */
const ALLOWED_DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com'])

export function isAllowedDriveUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  return ALLOWED_DRIVE_HOSTS.has(url.hostname.replace(/^www\./, '').toLowerCase())
}

export function checkDriveLink(raw: string): DriveLinkCheck {
  const value = raw.trim()
  if (!value) return 'ok' // nothing typed yet - stay quiet

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'ok' // malformed - <input type="url"> and the server schema handle that
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  if (host === 'drive.google.com') {
    // A folder link shares everything in the folder and is usually not what's meant.
    return url.pathname.startsWith('/drive/folders/') ? 'folder' : 'ok'
  }
  if (host === 'docs.google.com') return 'ok' // Docs / Sheets / Slides are fine
  return 'not-drive'
}

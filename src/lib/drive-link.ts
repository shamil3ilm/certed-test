/**
 * Classifies a pasted link so the submit / resource forms can show a soft,
 * non-blocking nudge before someone shares a link their audience can't open.
 *
 * A file's Drive *sharing* setting isn't visible from the URL, so this can only
 * flag the shapes that are usually a mistake (a folder link, or a non-Google
 * link) — it never blocks submission, it just prompts a second look.
 */
export type DriveLinkCheck = 'ok' | 'folder' | 'not-drive'

export function checkDriveLink(raw: string): DriveLinkCheck {
  const value = raw.trim()
  if (!value) return 'ok' // nothing typed yet — stay quiet

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'ok' // malformed — <input type="url"> and the server schema handle that
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  if (host === 'drive.google.com') {
    // A folder link shares everything in the folder and is usually not what's meant.
    return url.pathname.startsWith('/drive/folders/') ? 'folder' : 'ok'
  }
  if (host === 'docs.google.com') return 'ok' // Docs / Sheets / Slides are fine
  return 'not-drive'
}

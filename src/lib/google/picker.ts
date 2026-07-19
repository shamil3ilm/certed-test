'use client'
import { readDriveConfig } from './drive-config'
import { parsePickerDoc, type PickedFile } from './picker-result'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const GAPI_SRC = 'https://apis.google.com/js/api.js'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

/* eslint-disable @typescript-eslint/no-explicit-any -- third-party globals */
declare global {
  interface Window {
    gapi: any
    google: any
  }
}

// Cache the in-flight load promise per src so a fast double-click can't proceed
// to touch window.gapi/window.google before the script has actually executed
// (a DOM-presence check alone resolves too early).
const scriptPromises = new Map<string, Promise<void>>()
function loadScript(src: string): Promise<void> {
  const existing = scriptPromises.get(src)
  if (existing) return existing
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
  scriptPromises.set(src, p)
  return p
}

let pickerModule: Promise<void> | null = null
async function ensureLoaded(): Promise<void> {
  await Promise.all([loadScript(GIS_SRC), loadScript(GAPI_SRC)])
  if (!pickerModule) {
    pickerModule = new Promise<void>((resolve) => window.gapi.load('picker', () => resolve()))
  }
  await pickerModule
}

/** Get a short-lived drive.file access token for the current student. */
export async function getDriveAccessToken(loginHint?: string): Promise<string> {
  const cfg = readDriveConfig()
  if (!cfg) throw new Error('Google Drive is not configured')
  await ensureLoaded()
  return new Promise<string>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: DRIVE_SCOPE,
      login_hint: loginHint,
      // In-flow OAuth errors (e.g. consent denied) arrive here…
      callback: (resp: any) =>
        resp.error ? reject(new Error(resp.error)) : resolve(resp.access_token),
      // …while popup-level failures (closed / blocked) arrive here — without this,
      // closing the Google popup would leave the promise (and the button) hung.
      error_callback: (err: any) =>
        reject(new Error(err?.type ?? 'Google sign-in was cancelled')),
    })
    client.requestAccessToken()
  })
}

/**
 * Open the Picker. Resolves to the picked file, or `null` only when the student
 * cancels. Rejects on an upload/Picker error or an unreadable pick, so the caller
 * can surface a message instead of silently doing nothing.
 */
export async function showDrivePicker(accessToken: string): Promise<PickedFile | null> {
  const cfg = readDriveConfig()
  if (!cfg) throw new Error('Google Drive is not configured')
  await ensureLoaded()
  const g = window.google
  return new Promise<PickedFile | null>((resolve, reject) => {
    const picker = new g.picker.PickerBuilder()
      .setAppId(cfg.appId)
      .setOAuthToken(accessToken)
      .setDeveloperKey(cfg.apiKey)
      .addView(new g.picker.DocsUploadView())
      // Only the student's OWN files — never auto-publish a file merely shared to them.
      .addView(new g.picker.DocsView().setIncludeFolders(false).setOwnedByMe(true))
      .setCallback((data: any) => {
        const action = data[g.picker.Response.ACTION]
        if (action === g.picker.Action.PICKED) {
          const file = parsePickerDoc(data[g.picker.Response.DOCUMENTS]?.[0] ?? null)
          if (file) resolve(file)
          else reject(new Error('Could not read the selected file — please try again'))
        } else if (action === g.picker.Action.CANCEL) {
          resolve(null)
        } else if (action === g.picker.Action.ERROR) {
          reject(new Error('Google Drive had a problem — please try again'))
        }
        // Non-terminal actions (e.g. LOADED) are ignored until a terminal one arrives.
      })
      .build()
    picker.setVisible(true)
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */

import 'server-only'
import { google } from 'googleapis'

function oauthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return client
}

/**
 * A Drive v3 client authenticated as the institute "Drive owner" account via a
 * stored refresh token. Server-only — the token never reaches the browser.
 */
export async function getDriveClient() {
  return google.drive({ version: 'v3', auth: oauthClient() })
}

/** Mints a short-lived access token (used to open resumable upload sessions). */
export async function getDriveAccessToken(): Promise<string> {
  const { token } = await oauthClient().getAccessToken()
  if (!token) throw new Error('drive: failed to mint access token')
  return token
}

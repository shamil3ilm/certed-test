import 'server-only'
import { google } from 'googleapis'

/**
 * A Drive v3 client authenticated as the institute "Drive owner" account via a
 * stored refresh token. Server-only — the token never reaches the browser.
 */
export async function getDriveClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: oauth2 })
}

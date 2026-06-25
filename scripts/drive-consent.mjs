// scripts/drive-consent.mjs — run locally ONCE to mint GOOGLE_REFRESH_TOKEN.
// Usage: node --env-file=.env.local scripts/drive-consent.mjs
// Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET set, and
// http://localhost:5555/oauth2callback added to the OAuth client's redirect URIs.
import { google } from 'googleapis'
import http from 'node:http'

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:5555/oauth2callback',
)

const url = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file'],
})
console.log('\nOpen this URL while signed in as the institute Drive owner:\n', url, '\n')

http
  .createServer(async (req, res) => {
    if (!req.url.startsWith('/oauth2callback')) {
      res.end('ignored')
      return
    }
    const code = new URL(req.url, 'http://localhost:5555').searchParams.get('code')
    const { tokens } = await oauth2.getToken(code)
    console.log('\nGOOGLE_REFRESH_TOKEN=', tokens.refresh_token, '\n')
    res.end('Done — copy the refresh token from your terminal. You can close this tab.')
    process.exit(0)
  })
  .listen(5555, () => console.log('Listening on http://localhost:5555 ...'))

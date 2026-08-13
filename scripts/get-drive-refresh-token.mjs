// One-time helper to obtain GOOGLE_DRIVE_REFRESH_TOKEN for custodial attachment
// storage (see docs/deployment.md #6 and docs/environment.md).
//
// Prerequisites (do once, in Google Cloud, signed in as the DEDICATED academy
// Drive account):
//   1. Enable the Google Drive API.
//   2. Create an OAuth 2.0 client of type "Web application".
//   3. Add this exact Authorized redirect URI:  http://localhost:5178/callback
//      (or set PORT to match a URI you have already registered).
//
// Run it:
//   GOOGLE_DRIVE_CLIENT_ID=xxx GOOGLE_DRIVE_CLIENT_SECRET=yyy \
//     node scripts/get-drive-refresh-token.mjs
//
// Then open the printed URL, sign in as the dedicated account, approve, and copy
// the GOOGLE_DRIVE_REFRESH_TOKEN it prints into your Vercel env (mark it Sensitive).
// The token is a long-lived secret - treat it like a password and never commit it.

import http from 'node:http'

const PORT = Number(process.env.PORT || 5178)
const REDIRECT_URI = `http://localhost:${PORT}/callback`
// Full Drive scope: the dedicated account owns everything it stores, and the app
// must write into a root folder that may have been created by hand. `drive.file`
// would only reach files the app itself created - too narrow for that folder.
const SCOPE = 'https://www.googleapis.com/auth/drive'

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET first (from your OAuth client).')
  process.exit(1)
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', clientId)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', SCOPE)
authUrl.searchParams.set('access_type', 'offline') // ask for a refresh token
authUrl.searchParams.set('prompt', 'consent') // force one to be issued every run

function fail(res, message, detail) {
  if (res) res.end(`${message} - see the terminal.`)
  console.error(message, detail ?? '')
  process.exit(1)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', REDIRECT_URI)
  if (url.pathname !== '/callback') {
    res.writeHead(404)
    res.end()
    return
  }
  const error = url.searchParams.get('error')
  if (error) return fail(res, `Authorization was denied (${error})`)
  const code = url.searchParams.get('code')
  if (!code) return fail(res, 'No authorization code in the callback')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  }).catch((e) => fail(res, 'Token request failed to send', e))

  const json = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok || !json.refresh_token) {
    // No refresh_token usually means this account already granted consent; revoke
    // the app's access in the account's security settings and run again.
    return fail(res, 'Token exchange returned no refresh_token', JSON.stringify(json))
  }

  res.end('Success. Copy the GOOGLE_DRIVE_REFRESH_TOKEN from your terminal, then close this tab.')
  console.log('\n=== Set this on Vercel (Production), marked Sensitive ===\n')
  console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${json.refresh_token}\n`)
  server.close()
  process.exit(0)
})

server.listen(PORT, () => {
  console.log(`Registered redirect URI must be: ${REDIRECT_URI}\n`)
  console.log('Open this URL, sign in as the dedicated Drive account, and approve:\n')
  console.log(`  ${authUrl.toString()}\n`)
  console.log(`Waiting for the redirect on ${REDIRECT_URI} ...`)
})

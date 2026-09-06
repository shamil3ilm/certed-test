#!/usr/bin/env node
/**
 * Production preflight - check the DEPLOYED environment, not the repository.
 *
 * WHY THIS EXISTS
 *   The go-live blockers (B2-B7, SMTP, the crons, the OAuth consent screen) have sat at
 *   "Not verified" for nine audit passes with the note: "none of them is in the
 *   repository." That is true, and it is exactly why they never move - there is nothing to
 *   run, so verifying them means a person remembering to click through several dashboards.
 *
 *   This does not configure anything. It ASKS the deployed system what is actually true and
 *   prints a verdict, so "did anyone wire the drain?" is a command rather than a memory.
 *   Items it genuinely cannot see from outside (backup retention, PITR, the Vercel plan)
 *   are listed as MANUAL rather than quietly omitted - an unverifiable item must not read
 *   as a passing one.
 *
 * USAGE
 *   APP_URL=https://app.example.com CRON_SECRET=... node scripts/production-preflight.mjs
 *
 *   CRON_SECRET is optional: without it the queue checks are skipped rather than failed,
 *   because a 401 there proves only that the secret was missing.
 */

const APP = (process.env.APP_URL ?? '').replace(/\/$/, '')
const CRON_SECRET = process.env.CRON_SECRET ?? ''
if (!APP) {
  console.error('APP_URL is required, e.g. APP_URL=https://app.staging.certedacademia.com')
  process.exit(2)
}

const results = []
const record = (state, name, detail) => results.push({ state, name, detail })
const pass = (n, d) => record('PASS', n, d)
const fail = (n, d) => record('FAIL', n, d)
const warn = (n, d) => record('WARN', n, d)
const manual = (n, d) => record('MANUAL', n, d)

async function get(path, headers = {}) {
  const res = await fetch(`${APP}${path}`, { headers, redirect: 'manual' })
  const text = await res.text().catch(() => '')
  return { res, text }
}

// ── 1. The app is up and the database answers ────────────────────────────────
try {
  const { res, text } = await get('/api/health')
  const body = JSON.parse(text || '{}')
  if (res.ok && body.ok && body.db) pass('health', 'app up, database reachable')
  else fail('health', `status ${res.status} body ${text.slice(0, 120)}`)
} catch (e) {
  fail('health', `unreachable: ${e.message}`)
}

// ── 2. Region (B5) - Vercel names the serving region in x-vercel-id ──────────
try {
  const { res } = await get('/api/health')
  const id = res.headers.get('x-vercel-id') ?? ''
  const region = id.split('::')[0] || 'unknown'
  if (region.startsWith('bom')) pass('region', `served from ${region}`)
  else if (region === 'unknown') warn('region', 'no x-vercel-id header - not served by Vercel?')
  else warn('region', `served from ${region}, expected bom1 (vercel.json regions)`)
} catch (e) {
  warn('region', e.message)
}

// ── 3. Mock mode must be OFF in production ───────────────────────────────────
// The mock auth/DB bypass is the single worst thing to leave on. next.config.js refuses to
// BUILD with the vars set, so reaching this state means someone used the E2E_BUILD escape.
try {
  const { text } = await get('/login')
  const mocked = /Demo accounts \(mock mode\)|cert-ed<\/code>/i.test(text)
  if (mocked) fail('mock-mode', 'the login page is advertising demo accounts - MOCK MODE IS ON')
  else pass('mock-mode', 'no mock-mode markers on the login page')
} catch (e) {
  warn('mock-mode', e.message)
}

// ── 4. Google sign-in (OAuth consent screen) ─────────────────────────────────
// Deliberately NOT probed over HTTP. GoogleSignInGate renders the control only when
// window.location.hash === '#google', and a fragment is never sent to the server - so the
// button is absent from every server response by design. Probing it anyway produced a
// confident false alarm ("config is missing") against a perfectly healthy deployment,
// which is worse than not checking at all: a preflight that cries wolf stops being read.
manual(
  'oauth-consent',
  'open /login#google, sign in with Google once, and confirm the consent screen is PUBLISHED (a test-mode app admits only listed users)',
)

// ── 5. Security headers ──────────────────────────────────────────────────────
try {
  const { res } = await get('/login')
  const need = ['content-security-policy', 'x-content-type-options', 'strict-transport-security']
  const missing = need.filter((h) => !res.headers.get(h))
  if (missing.length === 0) pass('headers', 'CSP, nosniff and HSTS all present')
  else fail('headers', `missing: ${missing.join(', ')}`)
} catch (e) {
  warn('headers', e.message)
}

// ── 6. Queues - is the email drain actually running? ─────────────────────────
// The drain and reconcile crons cannot be scheduled in vercel.json (Hobby allows two
// daily jobs, and committing more would break preview deploys), so they are wired in the
// project dashboard - which is precisely why nobody can tell whether it was done. The
// queue's own health report answers it: a growing, ageing pending backlog means no drain.
if (!CRON_SECRET) {
  manual('queues', 'set CRON_SECRET to check the email/attachment queues from here')
} else {
  try {
    const { res, text } = await get('/api/cron/queue-health', { Authorization: `Bearer ${CRON_SECRET}` })
    if (res.status === 401) fail('queues', 'CRON_SECRET rejected - the value here does not match the deployment')
    else if (!res.ok) fail('queues', `status ${res.status}`)
    else {
      const body = JSON.parse(text || '{}')
      const h = body.health ?? body
      const breached = h.breached ?? h.ok === false
      if (breached) fail('queues', `queue health BREACHED: ${JSON.stringify(h).slice(0, 200)}`)
      else pass('queues', 'no email/attachment backlog breach')
    }
  } catch (e) {
    warn('queues', e.message)
  }
}

// ── 7. Things no HTTP request can answer ─────────────────────────────────────
manual('B2 backups', 'Supabase Pro + daily backups AND PITR enabled (dashboard)')
manual('B3 smtp', 'Auth email on custom SMTP (Resend) - send yourself a real password reset')
manual('B4 plan', 'Vercel Pro (needed for >2 crons and sub-daily schedules)')
manual('B6 envs', 'preview and production are separate projects with separate secrets')
manual('crons', 'drain-emails (~5-15 min) and reconcile-attachments (daily) scheduled on the project')
manual('B7 restore', 'a real restore drill against an actual Supabase backup, RTO recorded in docs/operations.md')

// ── verdict ──────────────────────────────────────────────────────────────────
const width = Math.max(...results.map((r) => r.name.length))
for (const r of results) {
  console.log(`${r.state.padEnd(6)} ${r.name.padEnd(width)}  ${r.detail}`)
}
const failed = results.filter((r) => r.state === 'FAIL')
const manualCount = results.filter((r) => r.state === 'MANUAL').length
console.log(
  `\n${results.filter((r) => r.state === 'PASS').length} pass, ${failed.length} fail, ` +
    `${results.filter((r) => r.state === 'WARN').length} warn, ${manualCount} need a human.`,
)
if (failed.length) {
  console.log('\nFAILING:')
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
}
console.log(
  `\nThe ${manualCount} MANUAL items are not passes. They are the go-live blockers that\n` +
    `cannot be observed over HTTP - tick them off in docs/production-checklist.md.`,
)
process.exit(failed.length ? 1 : 0)

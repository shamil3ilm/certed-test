// E2E DNS shim: map `app.localhost` -> 127.0.0.1 for the NODE side of the test run.
//
// The Playwright browser resolves `app.localhost` via its own flag
// (--host-resolver-rules=MAP app.localhost 127.0.0.1), but Node's resolver has no
// such mapping, so any SERVER-SIDE resolution of `app.localhost` (e.g. the Next
// server's internal fetch while completing a Server Action) fails with
// `getaddrinfo ENOTFOUND app.localhost` and surfaces as "failed to get redirect
// response". Patching dns.lookup here - loaded before anything else via
// `NODE_OPTIONS=--import` - makes Node agree with the browser without touching the
// app's host-based routing (the request Host is still `app.localhost`).
//
// Test-only: wired in exclusively through playwright.config.ts, never in a real build.
import dns from 'node:dns'

const TARGET = '127.0.0.1'
const MAPPED = new Set(['app.localhost'])

const realLookup = dns.lookup.bind(dns)
dns.lookup = function lookup(hostname, options, callback) {
  if (!MAPPED.has(hostname)) return realLookup(hostname, options, callback)
  const cb = typeof options === 'function' ? options : callback
  const wantsAll = typeof options === 'object' && options !== null && options.all === true
  if (wantsAll) return process.nextTick(cb, null, [{ address: TARGET, family: 4 }])
  return process.nextTick(cb, null, TARGET, 4)
}

const realPromiseLookup = dns.promises.lookup.bind(dns.promises)
dns.promises.lookup = async function lookup(hostname, options) {
  if (!MAPPED.has(hostname)) return realPromiseLookup(hostname, options)
  const wantsAll = typeof options === 'object' && options !== null && options.all === true
  return wantsAll ? [{ address: TARGET, family: 4 }] : { address: TARGET, family: 4 }
}

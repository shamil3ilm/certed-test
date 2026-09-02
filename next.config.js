// Build-time guard for the public Supabase config. NEXT_PUBLIC_* values are inlined
// into the CLIENT bundle at BUILD time; if they are missing here - unset, or marked
// "Sensitive" in Vercel (Sensitive vars are withheld from the build step) - the
// browser Supabase client cannot initialise and sign-in breaks, with nothing in the
// runtime server logs to trace (the server still has the value at runtime). Log it
// loudly in the BUILD output so the misconfiguration is caught in the deploy logs
// instead of only in a user's browser. (Promote console.error -> throw for fail-fast.)
if ((process.env.NEXT_PUBLIC_MOCK_MODE ?? process.env.MOCK_MODE ?? '0') !== '1') {
  const missingPublicEnv = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'].filter(
    (name) => !process.env[name],
  )
  if (missingPublicEnv.length > 0) {
    // Fail the BUILD, not a user's browser. These NEXT_PUBLIC_* values are inlined
    // into the client bundle at build time; if they are unset - or marked
    // "Sensitive" in Vercel, which withholds them from the build - the browser
    // Supabase client silently fails and sign-in breaks for everyone, with nothing
    // in the runtime logs. A thrown build error surfaces the misconfiguration in
    // the deploy log where it can be fixed. Set them as NON-sensitive vars.
    throw new Error(
      `[build] Missing required public env at build time: ${missingPublicEnv.join(', ')}. ` +
        'These NEXT_PUBLIC_* values must be set (and NOT marked "Sensitive") so they inline into the client bundle.',
    )
  }
}

// Build-time guard: never ship the mock auth/DB bypass to production. The mock stack
// writes a plaintext JSON "DB", stores demo passwords, and authenticates off an
// unsigned cookie - a mock var present in a production build means dev config leaked
// into prod. isMock() also fails closed at runtime, but failing the BUILD surfaces the
// misconfiguration in the deploy log. Fails CLOSED (V-06): fires in every
// production-like build that is not positively sanctioned - local dev, a Vercel
// *preview*, or the E2E build (E2E_BUILD=1) are the only mock-permitted contexts, so a
// self-hosted `next start` build carrying mock vars is caught too. Keep this list and
// the sanctioned-context logic in sync with src/lib/mock/env.ts (the runtime backstop);
// tests/unit/mock-env-guard.test.ts asserts the list parity.
const isEnabling = (v) => v != null && v !== '' && v !== '0' && String(v).toLowerCase() !== 'false'
const mockSanctioned =
  process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview' || isEnabling(process.env.E2E_BUILD)
if (!mockSanctioned) {
  const mockVarsPresent = [
    'MOCK_MODE',
    'NEXT_PUBLIC_MOCK_MODE',
    'ALLOW_MOCK_AUTH',
    'MOCK_PASSWORD',
    'MOCK_CHROME_PATH',
  ].filter((name) => isEnabling(process.env[name]))
  if (mockVarsPresent.length > 0) {
    throw new Error(
      `[build] Mock-only env var(s) set in a production deployment: ${mockVarsPresent.join(', ')}. ` +
        'These drive the in-memory mock auth/DB bypass and must never be present in production. ' +
        'Remove them from the Production environment and redeploy.',
    )
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise the framework (minor fingerprinting reduction)
  // Local portal QA and Playwright run through `app.localhost` while the dev
  // server itself is usually started on `localhost`; allow that explicit
  // cross-origin dev host so Next's future default block does not break local
  // asset/HMR requests.
  allowedDevOrigins: ['app.localhost'],
  env: {
    // Expose the canonical mock-mode flag to browser code so client-side
    // features such as the Drive picker use the same toggle as the server-side
    // mock stack.
    NEXT_PUBLIC_MOCK_MODE: process.env.NEXT_PUBLIC_MOCK_MODE ?? process.env.MOCK_MODE ?? '0',
    // Derived build-time literal ('0'/'1') for whether a Sentry DSN is present at
    // build. instrumentation-client gates the SDK import on this literal so the
    // bundler can fold the branch and keep the ~145 KB Sentry SDK out of the client
    // bundle entirely when it is unset (an unset NEXT_PUBLIC_* var is not inlined,
    // so gating on the DSN itself would not fold).
    NEXT_PUBLIC_SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_DSN ? '1' : '0',
  },
  // Keep the headless-Chromium PDF deps out of the server bundle - they load from
  // node_modules at runtime rather than being bundled.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  // The PDF routes readFileSync() the brand fonts/logo from public/, which serverless
  // functions don't bundle by default - trace them in so the render doesn't ENOENT
  // on Vercel.
  outputFileTracingIncludes: {
    '/api/receipts/[id]/pdf': ['./src/lib/pdf/assets/**', './node_modules/@sparticuz/chromium/**'],
    '/api/payslips/[id]/pdf': ['./src/lib/pdf/assets/**', './node_modules/@sparticuz/chromium/**'],
    '/api/report-card/[studentId]/pdf': ['./src/lib/pdf/assets/**', './node_modules/@sparticuz/chromium/**'],
  },
  experimental: {
    // The portal is force-dynamic (always fresh server-side), but the client
    // Router Cache still reuses a dynamic route by default - so after an
    // issue/void the /dashboard finance card could show a stale cached copy on
    // navigation. `dynamic: 0` disables that reuse so any navigation refetches.
    staleTimes: { dynamic: 0 },
  },
  // Defense-in-depth security headers (HSTS is added at the Vercel edge).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Force HTTPS for 2 years (Vercel also sets this at the edge — belt-and-suspenders).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // Isolate the browsing context from cross-origin windows, but still allow
          // popups (Google OAuth / Drive Picker open one) — 'same-origin' would break them.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          // The Content-Security-Policy is set PER REQUEST in src/proxy.ts, not here:
          // the portal uses a per-request nonce (so script-src can drop
          // 'unsafe-inline'/'unsafe-eval'), which a static config header cannot carry.
          // See lib/security/csp.ts.
        ],
      },
      {
        // Sensitive API responses (PDFs, downloads, data) must not be embeddable
        // cross-site. Scoped to /api only, so marketing OG-image crawlers (which
        // fetch /public assets, not /api) are unaffected.
        source: '/api/:path*',
        headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }],
      },
    ]
  },
}

module.exports = nextConfig

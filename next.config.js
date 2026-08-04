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
    console.error(
      `\n[build] WARNING: missing public env at build time: ${missingPublicEnv.join(', ')}.\n` +
        '  These NEXT_PUBLIC_* values are inlined into the client bundle at build time. If they are unset,\n' +
        '  or marked "Sensitive" in Vercel (Sensitive vars are withheld from the build), the browser\n' +
        '  Supabase client fails and sign-in breaks. Set them as NON-sensitive vars and redeploy.\n',
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
          {
            // Defense-in-depth against injected scripts. 'unsafe-inline'/'unsafe-eval'
            // are required by the Next.js runtime; the Google hosts allow the optional
            // Drive Picker; Supabase is allowed for auth/data XHR.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://accounts.google.com https://apis.google.com",
              'frame-src https://accounts.google.com https://content.googleapis.com https://docs.google.com https://drive.google.com',
              "object-src 'none'",
              "base-uri 'self'",
              // NB: no `form-action` — it blocks redirect-after-POST across hosts
              // (and the app has no cross-origin forms / injection vectors anyway).
              "frame-ancestors 'none'",
            ].join('; '),
          },
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

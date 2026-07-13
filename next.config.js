/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep the headless-Chromium PDF deps out of the bundle (server-only, runtime).
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
    // The PDF routes readFileSync() the brand fonts/logo from public/, which is
    // NOT bundled into serverless functions by default — trace them in so the
    // render doesn't ENOENT on Vercel. (Verify on a preview deploy.)
    outputFileTracingIncludes: {
      '/api/receipts/[id]/pdf': ['./public/fonts/**', './public/lockups/**', './node_modules/@sparticuz/chromium/**'],
      '/api/payslips/[id]/pdf': ['./public/fonts/**', './public/lockups/**', './node_modules/@sparticuz/chromium/**'],
      '/api/report-card/[studentId]/pdf': ['./public/fonts/**', './public/lockups/**', './node_modules/@sparticuz/chromium/**'],
    },
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
              "frame-src https://accounts.google.com https://content.googleapis.com https://docs.google.com https://drive.google.com",
              "object-src 'none'",
              "base-uri 'self'",
              // NB: no `form-action` — it blocks redirect-after-POST across hosts
              // (and the app has no cross-origin forms / injection vectors anyway).
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
};

module.exports = nextConfig;

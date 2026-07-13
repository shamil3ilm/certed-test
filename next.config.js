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
        ],
      },
    ]
  },
};

module.exports = nextConfig;

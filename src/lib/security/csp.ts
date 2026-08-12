/**
 * Content-Security-Policy construction for the proxy, split by surface.
 *
 * - The **portal** (app host) is force-dynamic and ships only Next's own scripts, so
 *   a per-request nonce lets `script-src` drop `'unsafe-inline'` and (in production)
 *   `'unsafe-eval'` - the S6 hardening. During SSR Next parses the nonce out of the
 *   request's CSP header and stamps it onto every framework/page script itself, so
 *   nothing in the app has to thread it through by hand. `'strict-dynamic'` then lets
 *   those trusted scripts load their own chunks without an explicit host allowlist.
 * - **Marketing** pages are statically rendered, so there is no per-request nonce to
 *   hang their inline bootstrap scripts on; they keep `'unsafe-inline'`. Public
 *   brochureware with no privileged data - a low-risk place to keep it.
 *
 * `'unsafe-eval'` is added only in development, where React uses `eval` for richer
 * error overlays; neither React nor Next use `eval` in a production build. Every
 * other directive is identical across the two surfaces.
 */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function buildContentSecurityPolicy(nonce: string | null): string {
  const isDev = process.env.NODE_ENV === 'development'
  const devEval = isDev ? " 'unsafe-eval'" : ''
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`
    : `script-src 'self' 'unsafe-inline'${devEval}`
  return [
    "default-src 'self'",
    scriptSrc,
    // Next injects inline <style> for CSS and fonts; nonce-ing those is impractical,
    // so styles keep 'unsafe-inline' (style injection is not a meaningful XSS vector).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://accounts.google.com https://apis.google.com",
    'frame-src https://accounts.google.com https://content.googleapis.com https://docs.google.com https://drive.google.com',
    "object-src 'none'",
    "base-uri 'self'",
    // NB: no `form-action` - it blocks redirect-after-POST across hosts, and the app
    // has no cross-origin forms.
    "frame-ancestors 'none'",
  ].join('; ')
}

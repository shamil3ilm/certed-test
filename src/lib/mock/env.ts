/**
 * MOCK MODE - a dev-only, in-memory fake of Supabase (auth + Postgres) so the
 * portal can be run and clicked through locally with NO real Supabase project.
 *
 * Activated by `MOCK_MODE=1` in `.env.local`. Every integration point checks
 * `isMock()` and falls back to the real Supabase/Drive path when it is off, so
 * production builds (which never set MOCK_MODE) are completely unaffected.
 *
 * Fidelity note: the fake does NOT enforce row-level security - it returns
 * seeded rows matching the explicit `.eq()` filters a repo applies. It is for
 * UI/flow click-through only, never a substitute for the real RLS tests.
 */
export function readMockModeFlag(): boolean {
  return (process.env.MOCK_MODE ?? process.env.NEXT_PUBLIC_MOCK_MODE) === '1'
}

/**
 * Env vars that only ever belong in local dev or the E2E mock build. Any of them
 * reaching a real production deployment means dev config leaked into prod.
 */
export const MOCK_ONLY_ENV_VARS = [
  'MOCK_MODE',
  'NEXT_PUBLIC_MOCK_MODE',
  'ALLOW_MOCK_AUTH',
  'MOCK_PASSWORD',
  'MOCK_CHROME_PATH',
] as const

/** A mock var counts as "set" only when it carries an ENABLING value - an explicit
 *  '0'/'false'/'' is a deliberate off switch and must not trip the guard. */
function isEnablingValue(v: string | undefined): boolean {
  return v != null && v !== '' && v !== '0' && v.toLowerCase() !== 'false'
}

/**
 * A context where the mock stack is legitimately allowed: local dev/test (NODE_ENV is
 * not 'production'), a Vercel PREVIEW deployment, or the E2E production build (which
 * declares itself with E2E_BUILD=1 alongside the mock vars). Everything else that is
 * production-like is NOT sanctioned.
 */
function isSanctionedMockContext(): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  if (process.env.VERCEL_ENV === 'preview') return true
  if (isEnablingValue(process.env.E2E_BUILD)) return true
  return false
}

/**
 * Refuse a production deployment that carries any mock-only env var. A mock var in
 * production is a misconfiguration in its own right (the mock stack writes a plaintext
 * JSON "DB", stores demo passwords, and authenticates off an unsigned cookie), so we
 * fail LOUDLY (build + boot) rather than tolerate it silently.
 *
 * Fails CLOSED: the guard fires in EVERY production-like context that is not positively
 * sanctioned (V-06). It previously keyed on VERCEL_ENV==='production' alone, so a
 * self-hosted `next start` (NODE_ENV=production, no VERCEL_ENV) slipped through - the
 * exact deployment where isMock() can still activate the bypass via ALLOW_MOCK_AUTH=1.
 * Now the only production-like context that keeps mock is the E2E build (E2E_BUILD=1).
 * Called from next.config (build time) and instrumentation.register() (runtime boot).
 */
export function assertNoMockConfigInProduction(): void {
  if (isSanctionedMockContext()) return
  const present = MOCK_ONLY_ENV_VARS.filter((name) => isEnablingValue(process.env[name]))
  if (present.length > 0) {
    throw new Error(
      `[prod] Mock-only env var(s) set in a production deployment: ${present.join(', ')}. ` +
        'These drive the in-memory mock auth/DB bypass and must never be present in production. ' +
        'Remove them from the Production environment and redeploy.',
    )
  }
}

export function isMock(): boolean {
  // Mock mode writes a JSON DB to disk, stores plaintext demo passwords, and
  // authenticates off an UNSIGNED identity cookie - so it must NEVER activate where
  // real users exist, on ANY host, not just Vercel. Fail closed:
  //   - a Vercel deployment is always excluded;
  //   - any other PRODUCTION runtime (e.g. a self-hosted `next start`) is excluded
  //     too, UNLESS ALLOW_MOCK_AUTH=1 is set - the affirmative, dev-only opt-in the
  //     E2E build sets and no real deployment ever would.
  // Local `next dev` is NODE_ENV=development, so MOCK_MODE=1 alone still works there.
  if (process.env.VERCEL === '1') return false
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_AUTH !== '1') return false
  return readMockModeFlag()
}

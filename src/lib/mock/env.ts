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
const MOCK_ONLY_ENV_VARS = [
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
 * Refuse a production deployment that carries any mock-only env var. isMock() already
 * fails closed on Vercel, so the bypass would not ACTIVATE - but a mock var present in
 * production is a misconfiguration in its own right, so we fail LOUDLY (build + boot)
 * rather than tolerate it silently. Scoped to Vercel's `production` environment on
 * purpose: the local E2E build deliberately sets MOCK_MODE + ALLOW_MOCK_AUTH and has no
 * VERCEL_ENV, and Vercel *preview* is allowed to run mock. Called from next.config
 * (build time) and instrumentation.register() (runtime boot).
 */
export function assertNoMockConfigInProduction(): void {
  if (process.env.VERCEL_ENV !== 'production') return
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

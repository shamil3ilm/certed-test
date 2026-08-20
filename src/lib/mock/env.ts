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

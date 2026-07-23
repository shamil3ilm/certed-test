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
  // Mock mode is LOCAL-only: it writes a JSON file (impossible on Vercel's
  // read-only FS) and stores plaintext demo passwords, so it must NEVER activate
  // on a deployed environment even if MOCK_MODE were mistakenly set there.
  if (process.env.VERCEL === '1') return false
  return readMockModeFlag()
}

/**
 * MOCK MODE — a dev-only, in-memory fake of Supabase (auth + Postgres) so the
 * portal can be run and clicked through locally with NO real Supabase project.
 *
 * Activated by `MOCK_MODE=1` in `.env.local`. Every integration point checks
 * `isMock()` and falls back to the real Supabase/Drive path when it is off, so
 * production builds (which never set MOCK_MODE) are completely unaffected.
 *
 * Fidelity note: the fake does NOT enforce row-level security — it returns
 * seeded rows matching the explicit `.eq()` filters a repo applies. It is for
 * UI/flow click-through only, never a substitute for the real RLS tests.
 */
export function isMock(): boolean {
  return process.env.MOCK_MODE === '1'
}

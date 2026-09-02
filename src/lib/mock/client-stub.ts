import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Build-time stub for the mock Supabase client. In a NON-mock production build,
 * next.config aliases `@/lib/mock/client` to this file, so the whole mock stack it pulls
 * in - the JSON-DB store, the seed (plaintext demo passwords), the in-memory query
 * builder - is excluded from the bundle entirely (the mock harness must not sit
 * in the production module graph). isMock() is false in such a build, so the real
 * createMock* factories are never reached; these stubs exist only so the static imports
 * in supabase/server.ts + admin.ts still resolve, and fail loudly if a misconfiguration
 * ever calls them.
 */
function unavailable(): never {
  throw new Error(
    'The mock Supabase client is not built into this bundle. This is a non-mock production ' +
      'build; the mock stack is deliberately excluded. Build with MOCK_MODE=1 (or E2E_BUILD=1) to use it.',
  )
}

export function createMockServerClient(): Promise<SupabaseClient> {
  return unavailable()
}

export function createMockAdminClient(): SupabaseClient {
  return unavailable()
}

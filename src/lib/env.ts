import 'server-only'

/**
 * Fail-fast access to required server environment.
 *
 * Reading a required variable through these helpers throws a clear, named error
 * the first time it is missing - instead of a bare `process.env.X!` non-null
 * assertion, which passes `undefined` straight into the client and fails later
 * with a cryptic message far from the cause.
 *
 * Only the real (non-mock) path calls these: mock mode never touches Supabase,
 * so a local click-through needs no keys.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in the deployment ` +
        `environment, or run locally with MOCK_MODE=1 for a keyless click-through.`,
    )
  }
  return value
}

/** URL + service-role secret for the admin (RLS-bypassing) client. */
export function supabaseServiceEnv(): { url: string; serviceKey: string } {
  return { url: required('NEXT_PUBLIC_SUPABASE_URL'), serviceKey: required('SUPABASE_SECRET_KEY') }
}

/** URL + publishable (anon) key for the request-scoped client. */
export function supabaseAnonEnv(): { url: string; anonKey: string } {
  return { url: required('NEXT_PUBLIC_SUPABASE_URL'), anonKey: required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') }
}

/**
 * Dedicated-account Google Drive credentials for custodial attachment storage.
 * SERVER-ONLY (never NEXT_PUBLIC): a refresh token for the academy's own Drive
 * account that the server exchanges for short-lived access tokens, plus the id of
 * the root folder new uploads are filed under. Only the real (non-mock)
 * DriveStorage adapter reads these; mock mode uses an in-memory provider.
 */
export function googleDriveEnv(): {
  clientId: string
  clientSecret: string
  refreshToken: string
  rootFolderId: string
} {
  return {
    clientId: required('GOOGLE_DRIVE_CLIENT_ID'),
    clientSecret: required('GOOGLE_DRIVE_CLIENT_SECRET'),
    refreshToken: required('GOOGLE_DRIVE_REFRESH_TOKEN'),
    rootFolderId: required('GOOGLE_DRIVE_ROOT_FOLDER_ID'),
  }
}

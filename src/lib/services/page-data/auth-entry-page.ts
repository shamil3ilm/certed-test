import { listProfiles } from '@/lib/services/users'

type AccessState = 'active' | 'pending' | 'disabled' | 'unauthenticated'

type EntryActor = {
  profile: unknown | null
  accessState: AccessState
}

export type LoginSearchParams = {
  error?: string
  registered?: string
}

export type LoginPageData = {
  redirectTo: string | null
  mockMode: boolean
  showRegisteredBanner: boolean
  mockLoginError: boolean
  demoEmails: string[]
}

export type RegisterPageData = {
  redirectTo: string | null
}

function redirectForActor(actor: EntryActor): string | null {
  if (!actor.profile) return null
  if (actor.accessState === 'disabled') return '/access-revoked'
  if (actor.accessState !== 'active') return '/access-pending'
  return '/dashboard'
}

export async function loadLoginPageData(
  actor: EntryActor,
  searchParams: LoginSearchParams,
  mockMode: boolean,
): Promise<LoginPageData> {
  const redirectTo = redirectForActor(actor)
  if (redirectTo) {
    return {
      redirectTo,
      mockMode,
      showRegisteredBanner: false,
      mockLoginError: false,
      demoEmails: [],
    }
  }

  const demoEmails = mockMode ? (await listProfiles()).slice(0, 5).map((profile) => profile.email) : []

  return {
    redirectTo: null,
    mockMode,
    showRegisteredBanner: Boolean(searchParams.registered),
    mockLoginError: Boolean(searchParams.error),
    demoEmails,
  }
}

export function loadRegisterPageData(actor: EntryActor, mockMode: boolean): RegisterPageData {
  if (mockMode) return { redirectTo: '/login' }
  return { redirectTo: redirectForActor(actor) }
}

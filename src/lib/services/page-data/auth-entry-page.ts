const MOCK_DEMO_EMAILS = [
  'admin@mock.test',
  'subadmin@mock.test',
  'tutor@mock.test',
  'mentor@mock.test',
  'student@mock.test',
] as const

type AccessState = 'active' | 'pending' | 'disabled' | 'unauthenticated'

type EntryActor = {
  profile: unknown | null
  accessState: AccessState
}

export type LoginSearchParams = {
  error?: string
  registered?: string
}

type LoginPageData = {
  redirectTo: string | null
  mockMode: boolean
  showRegisteredBanner: boolean
  mockLoginError: boolean
  demoEmails: string[]
}

type RegisterPageData = {
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

  // Gate on the BUILD-TIME mock literal (Next inlines NEXT_PUBLIC_* everywhere), so the
  // demo-email constants are tree-shaken OUT of a production bundle rather than merely
  // hidden at runtime. mockMode still gates the render within a mock build.
  const demoEmails = process.env.NEXT_PUBLIC_MOCK_MODE === '1' && mockMode ? [...MOCK_DEMO_EMAILS] : []

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

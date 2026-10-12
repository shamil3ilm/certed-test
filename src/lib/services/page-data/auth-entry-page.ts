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
  /** What to tell someone a failed sign-in sent back here, or null. */
  signInMessage: string | null
  demoEmails: string[]
}

/**
 * Messages for the `?error=` the OAuth callback redirects with. Outside mock mode the page
 * showed nothing at all for these, so a refused Google sign-in looked like a login page that
 * had simply forgotten the attempt.
 *
 * The student message names the route that WORKS. The others are deliberately vague: there is
 * nothing the person can do beyond asking an administrator, and a precise reason would only
 * tell them which of several internal states they are in.
 */
const SIGN_IN_MESSAGES: Record<string, string> = {
  'needs-setup-code':
    'A student account is set up with the setup code from your administrator, so a parent or guardian can give consent. Google sign-in cannot complete that step.',
  'not-invited':
    "That account is not on the academy's list yet. Ask an administrator to add the email address you want to sign in with.",
  signin: 'That sign-in did not complete. Please try again.',
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
      signInMessage: null,
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
    // An unrecognised value falls back to the generic message rather than rendering nothing:
    // whatever sent the person back here, something went wrong and they should hear so.
    signInMessage: searchParams.error ? (SIGN_IN_MESSAGES[searchParams.error] ?? SIGN_IN_MESSAGES.signin) : null,
    demoEmails,
  }
}

export function loadRegisterPageData(actor: EntryActor, mockMode: boolean): RegisterPageData {
  if (mockMode) return { redirectTo: '/login' }
  return { redirectTo: redirectForActor(actor) }
}

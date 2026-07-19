import type { Profile } from '@/lib/auth/profile'

export type Capability =
  | 'viewDashboard'
  | 'viewMessages'
  | 'viewClasses'
  | 'viewCalendar'
  | 'manageCalendar'
  | 'viewGrading'
  | 'viewUsers'
  | 'manageUsers'
  | 'viewFinance'
  | 'viewHistory'
  | 'viewMentees'
  | 'viewPayslips'
  | 'viewReceipts'
  | 'manageAdminTier'

const PERSONA_CAPABILITIES: Record<string, ReadonlySet<Capability>> = {
  admin: new Set<Capability>([
    'viewDashboard',
    'viewMessages',
    'viewClasses',
    'viewCalendar',
    'manageCalendar',
    'viewGrading',
    'viewUsers',
    'manageUsers',
    'viewFinance',
    'viewHistory',
    'viewMentees',
    // NOT viewPayslips/viewReceipts: those are the self-service "my own docs"
    // pages (tutor's payslips, student's receipts). An admin manages all finance
    // via /admin/finance, so surfacing those nav links only led to note-only
    // pages. Admin PDF access is enforced in render.ts, not via these caps.
    'manageAdminTier',
  ]),
  sub_admin: new Set<Capability>([
    'viewDashboard',
    'viewMessages',
    'viewUsers',
    'manageUsers',
  ]),
  tutor: new Set<Capability>([
    'viewDashboard',
    'viewMessages',
    'viewClasses',
    'viewCalendar',
    'manageCalendar',
    'viewGrading',
    'viewMentees',
    'viewPayslips',
  ]),
  mentor: new Set<Capability>([
    'viewDashboard',
    'viewMessages',
    'viewMentees',
  ]),
  student: new Set<Capability>([
    'viewDashboard',
    'viewMessages',
    'viewClasses',
    'viewCalendar',
    'viewReceipts',
  ]),
  // RESERVED, INTENTIONALLY NOT LISTED: `guardian`, `finance_operator`,
  // `assistant`, `executive` exist in the persona_name DB enum (migration 0014)
  // as forward-looking headroom, but nothing in the app can assign them
  // (roleToPersona yields only the four base personas; assignMentorPersona yields
  // only `mentor`). Advertising capabilities for personas no profile can hold
  // would misrepresent what the routes/loaders honor -- and reads as a live
  // access path that doesn't exist. When one of these becomes real, wire it end
  // to end (PersonaName, an assignment path, the dashboard loader, and its route
  // guards) and add its entry here in the same change. An unrecognized persona
  // aggregates to no capabilities (fail-closed) until then.
}

// Capabilities for a single profile keyed by its role — the fixed identity a
// profile is created with. Used by the Profile-arg overload of hasCapability for
// display/lookup; the personas-array overload aggregates instead (multi-persona).
const ROLE_CAPABILITIES: Record<Profile['role'], ReadonlySet<Capability>> = {
  admin: PERSONA_CAPABILITIES['admin'],
  sub_admin: PERSONA_CAPABILITIES['sub_admin'],
  tutor: PERSONA_CAPABILITIES['tutor'],
  student: PERSONA_CAPABILITIES['student'],
}

function aggregateCapabilities(personas: Array<{ persona_name: string }>): ReadonlySet<Capability> {
  const aggregated = new Set<Capability>()
  for (const persona of personas) {
    const caps = PERSONA_CAPABILITIES[persona.persona_name]
    if (caps) {
      caps.forEach((cap) => aggregated.add(cap))
    }
  }
  return aggregated
}

export function getCapabilities(arg: Profile | Array<{ persona_name: string }>): ReadonlySet<Capability> {
  if (Array.isArray(arg)) {
    return aggregateCapabilities(arg)
  }
  return ROLE_CAPABILITIES[arg.role]
}

export function hasCapability(arg: Profile | Array<{ persona_name: string }>, capability: Capability): boolean {
  return getCapabilities(arg).has(capability)
}

export function isAdminTier(arg: Profile | Array<{ persona_name: string }>): boolean {
  return hasCapability(arg, 'manageAdminTier')
}

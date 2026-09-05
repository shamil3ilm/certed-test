import { describe, expect, it, vi, beforeEach } from 'vitest'
import { loadSettingsPageData } from '@/lib/services/page-data/settings-page'

vi.mock('@/lib/permission/personas', () => ({
  loadPersonaFlags: vi.fn(),
}))
vi.mock('@/lib/services/consents', () => ({ getConsentStatus: vi.fn() }))

import { loadPersonaFlags } from '@/lib/permission/personas'
import { getConsentStatus } from '@/lib/services/consents'

const CONSENT = {
  acceptedTermsVersion: '2026-08-25',
  acceptedPrivacyVersion: '2026-08-25',
  acceptedAt: '2026-08-25T00:00:00.000Z',
  currentTermsVersion: '2026-08-25',
  currentPrivacyVersion: '2026-08-25',
  withdrawnAt: null,
  upToDate: true,
}

const tutor = {
  id: 'teach-1',
  email: 't@x.c',
  full_name: null,
  role: 'tutor',
  status: 'active',
  class_level: null,
  auth_user_id: 'auth-1',
} as any
const student = {
  id: 'stud-1',
  email: 's@x.c',
  full_name: null,
  role: 'student',
  status: 'active',
  class_level: 'Grade 8',
  auth_user_id: 'auth-2',
} as any
beforeEach(() => vi.clearAllMocks())

describe('loadSettingsPageData', () => {
  it('maps saved and error query state into stable alert objects for non-student', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({
      personas: [],
      isAdmin: false,
      isSubAdmin: false,
      isTutor: true,
      isManager: true,
      isStudent: false,
      isMentor: false,
    } as any)
    vi.mocked(getConsentStatus).mockResolvedValueOnce(CONSENT)
    expect(await loadSettingsPageData(tutor, { saved: 'profile', error: 'password' }, false)).toEqual({
      alerts: [
        { tone: 'success', message: 'Profile updated.' },
        { tone: 'error', message: 'Passwords must match and be at least 8 characters.' },
      ],
      showStudentClass: false,
      studentClassLabel: '-',
      passwordHelpText: 'This becomes your sign-in password.',
      roleLabel: 'Tutor',
      consent: CONSENT,
    })
  })

  it('exposes student-specific class display and mock password help text', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({
      personas: [],
      isAdmin: false,
      isSubAdmin: false,
      isTutor: false,
      isManager: false,
      isStudent: true,
      isMentor: false,
    } as any)
    vi.mocked(getConsentStatus).mockResolvedValueOnce(CONSENT)
    expect(await loadSettingsPageData(student, { saved: 'password' }, true)).toEqual({
      alerts: [{ tone: 'success', message: 'Password changed.' }],
      showStudentClass: true,
      studentClassLabel: 'Grade 8',
      passwordHelpText: 'This becomes your sign-in password. (Demo mode stores it locally.)',
      roleLabel: 'Student',
      consent: CONSENT,
    })
  })
})

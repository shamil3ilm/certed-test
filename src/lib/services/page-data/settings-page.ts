import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'

export type SettingsSearchParams = {
  saved?: string
  error?: string
}

export type SettingsAlert = {
  tone: 'success' | 'error'
  message: string
}

export type SettingsPageData = {
  alerts: SettingsAlert[]
  showStudentClass: boolean
  studentClassLabel: string
  passwordHelpText: string
  roleLabel: string
}

/** Highest-privilege label from persona flags — persona-native, not profiles.role. */
function labelFromFlags(flags: { isAdmin: boolean; isSubAdmin: boolean; isTutor: boolean; isMentor: boolean }): string {
  if (flags.isAdmin) return 'Super Admin'
  if (flags.isSubAdmin) return 'Sub Admin'
  if (flags.isTutor) return 'Tutor'
  if (flags.isMentor) return 'Mentor'
  return 'Student'
}

export async function loadSettingsPageData(
  actor: Profile,
  searchParams: SettingsSearchParams,
  isMockMode: boolean,
): Promise<SettingsPageData> {
  const alerts: SettingsAlert[] = []

  if (searchParams.saved === 'profile') {
    alerts.push({ tone: 'success', message: 'Profile updated.' })
  }
  if (searchParams.saved === 'password') {
    alerts.push({ tone: 'success', message: 'Password changed.' })
  }
  if (searchParams.error === 'password') {
    alerts.push({
      tone: 'error',
      message: 'Passwords must match and be at least 8 characters.',
    })
  }

  const flags = await loadPersonaFlags(actor.id)
  const showStudentClass = flags.isStudent

  return {
    alerts,
    showStudentClass,
    studentClassLabel: actor.class_level ?? '-',
    passwordHelpText: isMockMode
      ? 'This becomes your sign-in password. (Demo mode stores it locally.)'
      : 'This becomes your sign-in password.',
    roleLabel: labelFromFlags(flags),
  }
}

'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireActiveProfile } from '@/lib/auth/require-role'
import { RateLimitError, ValidationError } from '@/lib/errors'
import { updateOwnProfile, updateOwnProfileDetails, changeOwnPassword, changeOwnEmail } from '@/lib/services/users'
import { reaffirmCurrentConsent } from '@/lib/services/consents'
import {
  updateProfileSchema,
  selfProfileDetailsSchema,
  changePasswordSchema,
  changeEmailSchema,
} from '@/lib/validation/user'

export async function updateProfileAction(formData: FormData) {
  const me = await requireActiveProfile()
  const parsed = updateProfileSchema.safeParse({ full_name: formData.get('full_name') ?? undefined })
  if (!parsed.success) redirect('/settings?error=profile')

  await updateOwnProfile(me, { full_name: parsed.data.full_name || null })
  revalidatePath('/settings')
  redirect('/settings?saved=profile')
}

/** Self-complete the softer profile fields (contact, DOB, bio). */
export async function updateProfileDetailsAction(formData: FormData) {
  const me = await requireActiveProfile()
  const get = (name: string) => (formData.get(name) as string) || undefined
  const parsed = selfProfileDetailsSchema.safeParse({
    phone: get('phone'),
    date_of_birth: get('date_of_birth'),
    qualifications: get('qualifications'),
    bio: get('bio'),
  })
  if (!parsed.success) redirect('/settings?error=details')

  await updateOwnProfileDetails(me, parsed.data)
  revalidatePath('/settings')
  redirect('/settings?saved=details')
}

export async function changePasswordAction(formData: FormData) {
  const me = await requireActiveProfile()
  const parsed = changePasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) redirect('/settings?error=password')

  try {
    await changeOwnPassword(me, parsed.data.password)
  } catch (error) {
    // redirect() throws NEXT_REDIRECT, so it must stay outside this catch.
    if (error instanceof RateLimitError) redirect('/settings?error=password_limit')
    throw error
  }
  revalidatePath('/settings')
  redirect('/settings?saved=password')
}

export async function changeEmailAction(formData: FormData) {
  const me = await requireActiveProfile()
  const parsed = changeEmailSchema.safeParse({ email: formData.get('new_email') })
  if (!parsed.success) redirect('/settings?error=email')

  try {
    await changeOwnEmail(me, parsed.data.email)
  } catch (error) {
    // redirect() throws NEXT_REDIRECT, so it must stay outside this catch.
    if (error instanceof RateLimitError) redirect('/settings?error=email_limit')
    if (error instanceof ValidationError) redirect('/settings?error=email_taken')
    throw error
  }
  revalidatePath('/settings')
  redirect('/settings?saved=email')
}

/** Record a fresh acceptance of the CURRENT Terms + Privacy Policy - the self-service
 *  re-acceptance the settings page offers when the policies have changed since the
 *  person last accepted (N-07). Append-only: it never edits or erases prior records. */
export async function reaffirmConsentAction() {
  const me = await requireActiveProfile()
  await reaffirmCurrentConsent(me.id)
  revalidatePath('/settings')
  redirect('/settings?saved=consent')
}

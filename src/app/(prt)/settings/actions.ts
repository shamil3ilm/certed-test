'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireActiveProfile } from '@/lib/auth/require-role'
import { RateLimitError, ValidationError } from '@/lib/errors'
import { updateOwnProfile, changeOwnPassword, changeOwnEmail } from '@/lib/services/users'
import { updateProfileSchema, changePasswordSchema, changeEmailSchema } from '@/lib/validation/user'

export async function updateProfileAction(formData: FormData) {
  const me = await requireActiveProfile()
  const parsed = updateProfileSchema.safeParse({ full_name: formData.get('full_name') ?? undefined })
  if (!parsed.success) redirect('/settings?error=profile')

  await updateOwnProfile(me, { full_name: parsed.data.full_name || null })
  revalidatePath('/settings')
  redirect('/settings?saved=profile')
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

'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireActiveProfile } from '@/lib/auth/require-role'
import { updateOwnProfile, changeOwnPassword } from '@/lib/services/users'
import { updateProfileSchema, changePasswordSchema } from '@/lib/validation/user'

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

  await changeOwnPassword(me, parsed.data.password)
  revalidatePath('/settings')
  redirect('/settings?saved=password')
}

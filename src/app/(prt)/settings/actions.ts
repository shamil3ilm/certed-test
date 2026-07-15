'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { updateOwnProfile } from '@/lib/services/users'
import { isMock } from '@/lib/mock/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/repos/audit'
import { updateProfileSchema, changePasswordSchema } from '@/lib/validation/user'

const ALL = ['admin', 'sub_admin', 'teacher', 'student'] as const

export async function updateProfileAction(formData: FormData) {
  const me = await requireRole([...ALL])
  const parsed = updateProfileSchema.safeParse({ full_name: formData.get('full_name') ?? undefined })
  if (!parsed.success) redirect('/settings?error=profile')
  // Class/grade is an admin-controlled fact — self-service only edits the name.
  await updateOwnProfile(me.id, { full_name: parsed.data.full_name || null })
  await writeAudit({ actor_id: me.id, action: 'profile.update', entity_type: 'profile', entity_id: me.id })
  revalidatePath('/settings')
  redirect('/settings?saved=profile')
}

export async function changePasswordAction(formData: FormData) {
  const me = await requireRole([...ALL])
  const parsed = changePasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) redirect('/settings?error=password')
  const { password } = parsed.data

  if (isMock()) {
    const admin = createAdminClient()
    await admin.from('profiles').update({ password }).eq('id', me.id)
  } else {
    const supabase = await createClient()
    await supabase.auth.updateUser({ password })
  }
  await writeAudit({ actor_id: me.id, action: 'profile.password', entity_type: 'profile', entity_id: me.id })
  revalidatePath('/settings')
  redirect('/settings?saved=password')
}

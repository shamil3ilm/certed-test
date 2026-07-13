'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { updateOwnProfile } from '@/lib/repos/users'
import { isMock } from '@/lib/mock/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/repos/audit'

const ALL = ['admin', 'teacher', 'student'] as const

export async function updateProfileAction(formData: FormData) {
  const me = await requireRole([...ALL])
  // Class/grade is an admin-controlled fact — self-service only edits the name.
  const full_name = String(formData.get('full_name') ?? '').trim() || null
  await updateOwnProfile(me.id, { full_name })
  await writeAudit({ actor_id: me.id, action: 'profile.update', entity_type: 'profile', entity_id: me.id })
  revalidatePath('/settings')
  redirect('/settings?saved=profile')
}

export async function changePasswordAction(formData: FormData) {
  const me = await requireRole([...ALL])
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  // Min 8 — matches the self-registration policy (registerSchema), not weaker.
  if (password.length < 8 || password !== confirm) redirect('/settings?error=password')

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

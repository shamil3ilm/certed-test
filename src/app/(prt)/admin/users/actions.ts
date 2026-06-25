'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { addUserSchema } from '@/lib/validation/user'
import { addUser, setUserStatus } from '@/lib/repos/users'
import { writeAudit } from '@/lib/repos/audit'

export async function addUserAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const parsed = addUserSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    full_name: (formData.get('full_name') as string) || undefined,
    role: String(formData.get('role') ?? ''),
    class_level: (formData.get('class_level') as string) || undefined,
  })
  if (!parsed.success) return
  const profile = await addUser(parsed.data)
  await writeAudit({ actor_id: me.id, action: 'user.add', entity_type: 'profile', entity_id: profile.id })
  revalidatePath('/admin/users')
}

export async function revokeUserAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await setUserStatus(id, 'disabled')
  await writeAudit({ actor_id: me.id, action: 'user.revoke', entity_type: 'profile', entity_id: id })
  revalidatePath('/admin/users')
}

export async function restoreUserAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await setUserStatus(id, 'active')
  await writeAudit({ actor_id: me.id, action: 'user.restore', entity_type: 'profile', entity_id: id })
  revalidatePath('/admin/users')
}

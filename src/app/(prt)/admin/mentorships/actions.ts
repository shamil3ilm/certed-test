'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { assignMentor, removeMentor } from '@/lib/repos/mentorships'
import { writeAudit } from '@/lib/repos/audit'

export async function assignMentorAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const teacher_id = String(formData.get('teacher_id') ?? '')
  const student_id = String(formData.get('student_id') ?? '')
  if (!teacher_id || !student_id) return
  await assignMentor(teacher_id, student_id)
  await writeAudit({ actor_id: me.id, action: 'mentorship.assign', entity_type: 'mentorship', entity_id: student_id })
  revalidatePath('/admin/mentorships')
}

export async function removeMentorAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await removeMentor(id)
  await writeAudit({ actor_id: me.id, action: 'mentorship.remove', entity_type: 'mentorship', entity_id: id })
  revalidatePath('/admin/mentorships')
}

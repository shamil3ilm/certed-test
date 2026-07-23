import { ValidationError } from '@/lib/errors'
import { createAnnouncementSchema } from '@/lib/validation/announcement'
import { z } from 'zod'

/** Raw form values -> trusted inputs. Pure: no IO, no authorization. */

export type CreateAnnouncementInput = {
  class_id: string | null
  title: string
  message: string
}

const editAnnouncementInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
})

export type CreateAnnouncementActionInput = {
  class_id?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  message?: FormDataEntryValue | null
}

export type EditAnnouncementActionInput = {
  id?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  message?: FormDataEntryValue | null
}

export function validateCreateAnnouncementInput(input: CreateAnnouncementActionInput): CreateAnnouncementInput {
  const rawClassId = String(input.class_id ?? '')
  const parsed = createAnnouncementSchema.safeParse({
    class_id: rawClassId === '' ? null : rawClassId,
    title: String(input.title ?? ''),
    message: String(input.message ?? ''),
  })

  if (!parsed.success) {
    throw new ValidationError(`Invalid announcement data: ${parsed.error.message}`)
  }

  return {
    class_id: parsed.data.class_id ?? null,
    title: parsed.data.title,
    message: parsed.data.message,
  }
}

export function validateEditAnnouncementInput(input: EditAnnouncementActionInput): {
  id: string
  patch: { title: string; message: string }
} {
  const parsed = editAnnouncementInputSchema.safeParse({
    id: String(input.id ?? ''),
    title: String(input.title ?? ''),
    message: String(input.message ?? ''),
  })

  if (!parsed.success) {
    throw new ValidationError(`Invalid announcement update: ${parsed.error.message}`)
  }

  return {
    id: parsed.data.id,
    patch: {
      title: parsed.data.title,
      message: parsed.data.message,
    },
  }
}

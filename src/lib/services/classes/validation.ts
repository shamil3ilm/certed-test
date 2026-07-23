import { ValidationError } from '@/lib/errors'
import { createClassSchema } from '@/lib/validation/class'
import { z } from 'zod'

/** Turning raw form values into trusted inputs. Pure - no IO, no authorization. */

const classIdSchema = z.string().uuid()

export type CreateClassActionInput = {
  name?: FormDataEntryValue | null
}

export type RenameClassActionInput = {
  id?: FormDataEntryValue | null
  name?: FormDataEntryValue | null
}

export type ClassIdActionInput = {
  id?: FormDataEntryValue | null
}

export function validateCreateClassInput(input: CreateClassActionInput): { name: string } {
  const parsed = createClassSchema.safeParse({ name: String(input.name ?? '') })
  if (!parsed.success) {
    throw new ValidationError(`Invalid class data: ${parsed.error.message}`)
  }
  return parsed.data
}

export function validateRenameClassInput(input: RenameClassActionInput): { id: string; name: string } {
  const id = classIdSchema.safeParse(String(input.id ?? ''))
  const name = createClassSchema.safeParse({ name: String(input.name ?? '') })
  if (!id.success || !name.success) {
    throw new ValidationError('Invalid class rename data')
  }
  return { id: id.data, name: name.data.name }
}

export function validateClassIdInput(input: ClassIdActionInput): string {
  const parsed = classIdSchema.safeParse(String(input.id ?? ''))
  if (!parsed.success) {
    throw new ValidationError('Invalid class id')
  }
  return parsed.data
}

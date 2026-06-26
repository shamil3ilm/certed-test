import { z } from 'zod'
import { MAX_UPLOAD_BYTES } from '@/lib/drive/validate'

export const uploadInitSchema = z.object({
  course_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
})
export type UploadInitInput = z.infer<typeof uploadInitSchema>

export const uploadFinalizeSchema = z.object({
  resource_id: z.string().uuid(),
  drive_file_id: z.string().min(1).max(255),
})
export type UploadFinalizeInput = z.infer<typeof uploadFinalizeSchema>

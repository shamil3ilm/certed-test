import { z } from 'zod'

export const createClassSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

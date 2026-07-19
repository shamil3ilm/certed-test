import { authFail, ok, serverError } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/admin'

// Pinged daily by Vercel Cron so the free Supabase project doesn't pause.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  // Fail closed: an unset secret must never make the endpoint public.
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return authFail(new Error('unauthorized'))
  }
  const supabase = createAdminClient()
  const { error } = await supabase.from('org_settings').select('id').limit(1)
  if (error) return serverError()
  return ok({ alive: true })
}

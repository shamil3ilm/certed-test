import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Pinged daily by Vercel Cron so the free Supabase project doesn't pause.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const { error } = await supabase.from('org_settings').select('id').limit(1)
  return NextResponse.json({ success: !error })
}

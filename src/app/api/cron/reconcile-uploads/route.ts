import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { trashFile } from '@/lib/drive/resumable'
import { isStalePending } from '@/lib/uploads/reconcile'

// Trashes Drive files + deletes `pending` resource rows that were started but
// never finalized (e.g. the user closed the tab). Scheduled hourly.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  const { data } = await admin
    .from('resources')
    .select('id, drive_file_id, created_at')
    .eq('status', 'pending')

  const now = Date.now()
  let trashed = 0
  for (const row of (data ?? []) as {
    id: string
    drive_file_id: string | null
    created_at: string
  }[]) {
    if (!isStalePending(row.created_at, now)) continue
    if (row.drive_file_id) await trashFile(row.drive_file_id).catch(() => {})
    await admin.from('resources').delete().eq('id', row.id)
    trashed++
  }
  return NextResponse.json({ success: true, data: { trashed } })
}

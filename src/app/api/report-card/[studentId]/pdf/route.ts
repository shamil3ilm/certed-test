import { requireRoleApi } from '@/lib/auth/requireRole'
import { renderReportCardPdf } from '@/lib/reportCard/render'

// Headless-Chromium render: pin the Node runtime + generous timeout so a cold
// start can't 504 (same as the finance PDFs).
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(_req: Request, ctx: { params: { studentId: string } }) {
  let me
  try {
    me = await requireRoleApi(['admin', 'teacher', 'student'])
  } catch {
    return new Response('Forbidden', { status: 403 })
  }
  const out = await renderReportCardPdf(me, ctx.params.studentId)
  if (!out) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(out.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${out.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

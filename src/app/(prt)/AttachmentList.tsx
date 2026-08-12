import { cx } from '@/lib/ui'

/** The browser-facing shape of a custodial attachment (no internal Drive ids). */
export type AttachmentView = { id: string; filename: string; mimeType: string; size: number }

const PREVIEWABLE = /^(application\/pdf|image\/(png|jpeg))$/

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Renders a submission / document / announcement's ACTIVE attachments. Every link
 * points at the access-checked streaming route - the bytes never leave the app as a
 * public URL. PDFs and images also get an inline "Preview" (the same route with
 * ?inline=1); there is no Drive embed viewer, which would require public sharing.
 */
export function AttachmentList({ attachments, className }: { attachments: AttachmentView[]; className?: string }) {
  if (attachments.length === 0) return null
  return (
    <ul className={cx('space-y-1', className)}>
      {attachments.map((attachment) => (
        <li
          key={attachment.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <span className="min-w-0 truncate text-slate-700" title={attachment.filename}>
            {attachment.filename}
          </span>
          <span className="flex shrink-0 items-center gap-3 text-xs">
            <span className="text-slate-400">{formatSize(attachment.size)}</span>
            {PREVIEWABLE.test(attachment.mimeType) && (
              <a
                href={`/api/attachments/${attachment.id}/download?inline=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                Preview
              </a>
            )}
            <a href={`/api/attachments/${attachment.id}/download`} className="font-medium text-primary hover:underline">
              Download
            </a>
          </span>
        </li>
      ))}
    </ul>
  )
}

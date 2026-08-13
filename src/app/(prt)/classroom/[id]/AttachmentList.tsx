import { attachmentKind, drivePreviewUrl, type Attachment } from '@/lib/documents/preview'
import { DrivePreview } from './DrivePreview'
import { AttachmentImage, AttachmentOpenLink } from './AttachmentImage'

/** Renders announcement attachments: images inline, embeddable files (Drive /
 *  Docs / PDF) behind a Preview disclosure, everything else as an open-link. */
export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (!attachments?.length) return null
  return (
    <div className="mt-2 space-y-2">
      {attachments.map((att, index) => {
        const label = att.label || `Attachment ${index + 1}`
        const kind = attachmentKind(att.url)
        const attachmentKey = `${kind}:${att.url}:${label}`

        if (kind === 'image') {
          return <AttachmentImage key={attachmentKey} url={att.url} label={label} />
        }

        if (kind === 'preview') {
          const preview = drivePreviewUrl(att.url) ?? att.url
          return (
            <DrivePreview
              key={attachmentKey}
              src={preview}
              title={label}
              summary={`Preview ${label}`}
              className="rounded-lg border border-slate-100"
              summaryClassName="cursor-pointer px-3 py-2 text-xs font-medium text-primary hover:underline"
              iframeClassName="h-96 w-full rounded-b-lg border-t border-slate-100"
            />
          )
        }

        return <AttachmentOpenLink key={attachmentKey} url={att.url} label={label} />
      })}
    </div>
  )
}

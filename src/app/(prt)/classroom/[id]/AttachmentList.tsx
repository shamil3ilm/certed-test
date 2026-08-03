import { attachmentKind, drivePreviewUrl, type Attachment } from '@/lib/documents/preview'

/** Renders announcement attachments: images inline, embeddable files (Drive /
 *  Docs / PDF) behind a Preview disclosure, everything else as an open-link. */
export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (!attachments?.length) return null
  return (
    <div className="mt-2 space-y-2">
      {attachments.map((att, index) => {
        const label = att.label || `Attachment ${index + 1}`
        const kind = attachmentKind(att.url)

        if (kind === 'image') {
          return (
            <a key={att.url + index} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={att.url}
                alt={label}
                loading="lazy"
                className="max-h-64 rounded-lg border border-slate-200 object-contain"
              />
            </a>
          )
        }

        if (kind === 'preview') {
          const preview = drivePreviewUrl(att.url) ?? att.url
          return (
            <details key={att.url + index} className="rounded-lg border border-slate-100">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-primary hover:underline">
                Preview {label}
              </summary>
              <iframe
                src={preview}
                title={label}
                loading="lazy"
                className="h-96 w-full rounded-b-lg border-t border-slate-100"
              />
            </details>
          )
        }

        return (
          <a
            key={att.url + index}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            {label}
          </a>
        )
      })}
    </div>
  )
}

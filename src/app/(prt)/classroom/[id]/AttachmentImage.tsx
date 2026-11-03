'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'

/** Open-link render for a non-embeddable attachment (also the fallback for a broken
 *  image). A plain link never auto-loads external content, so a rotted URL only
 *  fails if the user actually clicks it. */
export function AttachmentOpenLink({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </a>
  )
}

/** An external image attachment. A cross-origin <img> fires onError (unlike a
 *  cross-origin iframe), so a rotted/inaccessible image URL degrades to the plain
 *  open-link instead of leaving a broken-image icon + a console 404 on load. */
export function AttachmentImage({ url, label }: { url: string; label: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <AttachmentOpenLink url={url} label={label} />
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        loading="lazy"
        onError={() => setBroken(true)}
        className="max-h-64 rounded-lg border border-slate-200 object-contain"
      />
    </a>
  )
}

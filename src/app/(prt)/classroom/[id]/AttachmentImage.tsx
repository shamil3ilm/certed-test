'use client'

import { useState } from 'react'

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

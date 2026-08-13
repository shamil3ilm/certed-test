'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'

/**
 * Collapsible inline preview for a legacy external Drive/Docs link. The <iframe> is
 * mounted only after the user opens the panel: a native <details> keeps its content
 * in the DOM even when collapsed, and a hidden iframe still fetches its src, so an
 * inaccessible/rotted legacy link would otherwise load a broken embed (and log a
 * console 404) on every page render. Deferring the mount loads the embed only on an
 * explicit click. Custodial documents never use this - they open through the app's
 * own access-checked stream, which can't 404 from a stale sharing setting.
 */
export function DrivePreview({
  src,
  title,
  summary,
  className,
  summaryClassName,
  iframeClassName,
}: {
  src: string
  title: string
  summary: ReactNode
  className?: string
  summaryClassName?: string
  iframeClassName?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <details className={className} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className={summaryClassName}>{summary}</summary>
      {open && <iframe src={src} title={title} loading="lazy" className={iframeClassName} />}
    </details>
  )
}

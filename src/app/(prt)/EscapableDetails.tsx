'use client'
import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A native <details> disclosure (keyboard-operable for free) that also closes on
 * Escape and outside-click, for parity with the overlay/menu dismissal elsewhere.
 * Children (which may include a server-action <form>) are rendered on the server
 * and passed through unchanged.
 */
export function EscapableDetails({
  className,
  summary,
  summaryClassName,
  children,
}: {
  className?: string
  summary: ReactNode
  summaryClassName?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && el.open) el.open = false
    }
    const onPointer = (event: MouseEvent) => {
      if (el.open && !el.contains(event.target as Node)) el.open = false
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [])

  return (
    <details ref={ref} className={className}>
      <summary className={summaryClassName}>{summary}</summary>
      {children}
    </details>
  )
}

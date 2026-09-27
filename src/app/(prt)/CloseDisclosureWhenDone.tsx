'use client'
import { useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'

/** Close the nearest <details> ancestor of `node`, if it sits in one. */
export function closeEnclosingDisclosure(node: Element | null): void {
  const disclosure = node?.closest('details')
  if (disclosure) disclosure.open = false
}

/**
 * Closes the <details> disclosure a form sits in, once that form's submission finishes.
 *
 * A server action re-renders the page, but the <details> element itself survives the re-render
 * with `open` still set - so an edit popover stays sitting over the row it has just saved, and
 * looks like the save did nothing. Escape and outside-click already dismiss it (EscapableDetails);
 * finishing the save did not.
 *
 * Rendered INSIDE the form, because useFormStatus reports the status of its nearest form
 * ancestor. The panel therefore stays open while the action runs - the submit button keeps
 * showing its pending label - and closes only once the server is done.
 */
export function CloseDisclosureWhenDone() {
  const { pending } = useFormStatus()
  const submitted = useRef(false)
  const marker = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (pending) {
      submitted.current = true
      return
    }
    // Only after a submission of our own: a first render is not a completed save.
    if (!submitted.current) return
    submitted.current = false
    closeEnclosingDisclosure(marker.current)
  }, [pending])

  return <span ref={marker} hidden />
}

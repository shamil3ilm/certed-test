import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Dialog keyboard behaviour for a mounted overlay: on open, move focus into the
 * container; keep Tab/Shift+Tab cycling inside it (so a keyboard user can't reach
 * the page behind); close on Escape; and restore focus to the triggering control
 * on close. Drive it with `active` = the dialog's open flag - it captures the
 * previously-focused element when active flips true and restores it on cleanup.
 *
 * The container element must be focusable as a fallback (give it tabIndex={-1})
 * so focus has somewhere to land when the dialog has no focusable children.
 */
export function useFocusTrap(
  // React 19 types: useRef<T>(null) is RefObject<T | null>, so accept the nullable ref.
  containerRef: RefObject<HTMLElement | null>,
  { active, onEscape }: { active: boolean; onEscape: () => void },
): void {
  const onEscapeRef = useRef(onEscape)

  useEffect(() => {
    onEscapeRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )

    // Move focus into the dialog (first focusable, else the container itself).
    ;(focusables()[0] ?? container).focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscapeRef.current()
        return
      }
      if (event.key !== 'Tab' || !container) return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const activeEl = document.activeElement
      if (event.shiftKey && (activeEl === first || !container.contains(activeEl))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (activeEl === last || !container.contains(activeEl))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused?.focus?.()
    }
  }, [active, containerRef])
}

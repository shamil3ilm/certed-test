/**
 * Our own message for a field the browser refuses, instead of its grey bubble.
 *
 * Every form here marks its fields with the standard constraints (`required`, `type=email`,
 * `minlength`, ...), so the browser already decides what is valid - the part worth replacing is
 * the presentation: a native bubble is styled by the browser, vanishes on the next click, is
 * announced inconsistently, and reads "Please fill out this field." beside a field the form
 * itself calls "Email".
 *
 * Cancelling the `invalid` event removes the bubble WITHOUT weakening validation: the browser
 * still refuses to submit. The message then renders under the field, in the app's own styling.
 * `invalid` does not bubble, so it is caught in the capture phase at the document - one listener
 * for every form, present and future.
 */

const MESSAGE_ATTR = 'data-field-error'
const MESSAGE_CLASS = 'mt-1 block text-xs font-medium text-danger-ink'

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

function isFormControl(target: EventTarget | null): target is FormControl {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
  )
}

/** Sentence-case a name taken from an attribute: "full_name" -> "Full name". */
function fromAttributeName(value: string): string {
  const words = value.replace(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
}

/**
 * What this field is called, in the form's own words: its label, then the accessible name, then
 * the placeholder, then the `name` attribute. Parenthesised asides ("Mentor (students)") and a
 * trailing colon are dropped, so the message reads as a sentence.
 */
export function fieldLabel(el: FormControl): string {
  const labelled = el.closest('label')?.querySelector('span')?.textContent
  const forLabel = el.id ? el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : null
  const raw =
    labelled ??
    el.getAttribute('aria-label') ??
    forLabel ??
    (el instanceof HTMLSelectElement ? '' : (el.getAttribute('placeholder') ?? '')) ??
    ''
  const cleaned = raw
    .replace(/\(.*?\)/g, '')
    .replace(/[:*]\s*$/, '')
    .trim()
  return cleaned || fromAttributeName(el.getAttribute('name') ?? '')
}

/** The message for whichever constraint the control failed. Empty when it is valid. */
export function fieldValidationMessage(el: FormControl): string {
  const validity = el.validity
  if (validity.valid) return ''
  const name = fieldLabel(el)
  const subject = name || 'This field'
  const lower = name ? name.charAt(0).toLowerCase() + name.slice(1) : 'a value'
  const type = el instanceof HTMLInputElement ? el.type : ''

  if (validity.valueMissing) {
    if (el instanceof HTMLSelectElement) return `Choose ${lower}.`
    if (type === 'checkbox' || type === 'radio') return `${subject} has to be selected.`
    return `${subject} is required.`
  }
  if (validity.typeMismatch) {
    if (type === 'email') return 'Enter an email address, like name@example.com.'
    if (type === 'url') return 'Enter a full web address, starting with https://'
    return `Enter a valid ${lower}.`
  }
  if (validity.patternMismatch) return el.title || `${subject} is not in the expected format.`
  if (validity.tooShort && el instanceof HTMLInputElement) {
    return `${subject} has to be at least ${el.minLength} characters.`
  }
  if (validity.tooLong && el instanceof HTMLInputElement) {
    return `${subject} has to be ${el.maxLength} characters or fewer.`
  }
  if (validity.rangeUnderflow && el instanceof HTMLInputElement) return `${subject} has to be ${el.min} or more.`
  if (validity.rangeOverflow && el instanceof HTMLInputElement) return `${subject} has to be ${el.max} or less.`
  if (validity.stepMismatch) return `${subject} is not one of the allowed values.`
  if (validity.badInput) return `Enter a valid ${lower}.`
  // Anything this list does not name still says something rather than nothing.
  return el.validationMessage || `${subject} is not valid.`
}

let messageSeq = 0

function showMessage(el: FormControl, text: string): void {
  const existing = el.nextElementSibling?.hasAttribute(MESSAGE_ATTR) ? el.nextElementSibling : null
  const node = existing ?? el.ownerDocument.createElement('p')
  if (!existing) {
    node.setAttribute(MESSAGE_ATTR, '')
    node.setAttribute('role', 'alert')
    node.id = `field-error-${++messageSeq}`
    node.className = MESSAGE_CLASS
    el.insertAdjacentElement('afterend', node)
  }
  node.textContent = text
  el.setAttribute('aria-invalid', 'true')
  el.setAttribute('aria-describedby', node.id)
}

function clearMessage(el: FormControl): void {
  const node = el.nextElementSibling
  if (node?.hasAttribute(MESSAGE_ATTR)) node.remove()
  el.removeAttribute('aria-invalid')
  el.removeAttribute('aria-describedby')
}

/**
 * Take over field validation messages for the whole document. Returns the undo, so a caller
 * that mounts this can unmount it.
 */
export function attachFieldValidationMessages(doc: Document): () => void {
  // The browser reports every invalid field of a submit in turn; the FIRST one gets the focus,
  // as the native behaviour does, so the person lands where the form stopped.
  let focusedThisSubmit = false

  function onInvalid(event: Event): void {
    const el = event.target
    if (!isFormControl(el)) return
    event.preventDefault()
    showMessage(el, fieldValidationMessage(el))
    if (!focusedThisSubmit) {
      focusedThisSubmit = true
      el.focus()
      // The run of invalid events is synchronous, so the flag resets once it is over.
      setTimeout(() => {
        focusedThisSubmit = false
      }, 0)
    }
  }

  function onEdit(event: Event): void {
    const el = event.target
    if (isFormControl(el) && el.hasAttribute('aria-invalid')) clearMessage(el)
  }

  doc.addEventListener('invalid', onInvalid, true)
  doc.addEventListener('input', onEdit, true)
  doc.addEventListener('change', onEdit, true)
  return () => {
    doc.removeEventListener('invalid', onInvalid, true)
    doc.removeEventListener('input', onEdit, true)
    doc.removeEventListener('change', onEdit, true)
  }
}

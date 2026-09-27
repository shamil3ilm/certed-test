import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { attachFieldValidationMessages, fieldLabel, fieldValidationMessage } from '@/lib/ui/field-validation'

/**
 * The browser decides what is valid; these cover what we put in place of its bubble - wording
 * that names the field the way the form does, and a message that appears under that field and
 * goes as soon as it is corrected.
 */

function field(html: string): HTMLInputElement | HTMLSelectElement {
  document.body.innerHTML = `<form>${html}</form>`
  return document.querySelector('input, select') as HTMLInputElement | HTMLSelectElement
}

let detach: () => void

beforeEach(() => {
  detach = attachFieldValidationMessages(document)
})
afterEach(() => {
  detach()
  document.body.innerHTML = ''
})

describe('fieldLabel', () => {
  it('reads the label the form shows', () => {
    expect(fieldLabel(field('<label><span>Email</span><input name="email" /></label>'))).toBe('Email')
  })

  it('drops a parenthesised aside, so the message reads as a sentence', () => {
    expect(fieldLabel(field('<label><span>Mentor (students)</span><select name="mentor_id"></select></label>'))).toBe(
      'Mentor',
    )
  })

  it('falls back to the accessible name, then the placeholder, then the field name', () => {
    expect(fieldLabel(field('<input aria-label="Search" name="q" />'))).toBe('Search')
    expect(fieldLabel(field('<input placeholder="Room 1 / Online" name="room" />'))).toBe('Room 1 / Online')
    expect(fieldLabel(field('<input name="full_name" />'))).toBe('Full name')
  })
})

describe('fieldValidationMessage', () => {
  it('names the field that was left empty', () => {
    const el = field('<label><span>Email</span><input name="email" required /></label>')
    expect(fieldValidationMessage(el)).toBe('Email is required.')
  })

  it("asks for a choice on a select, in the field's own words", () => {
    const el = field(
      '<label><span>Mentor</span><select name="mentor_id" required><option value=""></option></select></label>',
    )
    expect(fieldValidationMessage(el)).toBe('Choose mentor.')
  })

  it('explains a malformed email rather than repeating "invalid"', () => {
    const el = field('<label><span>Email</span><input type="email" name="email" /></label>') as HTMLInputElement
    el.value = 'not-an-email'
    expect(fieldValidationMessage(el)).toBe('Enter an email address, like name@example.com.')
  })

  it('says nothing for a field that is valid', () => {
    const el = field('<label><span>Email</span><input name="email" value="x" required /></label>')
    expect(fieldValidationMessage(el)).toBe('')
  })
})

describe('the message replaces the browser bubble', () => {
  it('cancels the native bubble and shows our message under the field', () => {
    const el = field('<label><span>Email</span><input name="email" required /></label>')
    const event = new Event('invalid', { cancelable: true, bubbles: false })
    el.dispatchEvent(event)

    expect(event.defaultPrevented, 'the native bubble is suppressed').toBe(true)
    const message = el.nextElementSibling
    expect(message?.textContent).toBe('Email is required.')
    expect(message?.getAttribute('role')).toBe('alert')
    expect(el.getAttribute('aria-invalid')).toBe('true')
    expect(el.getAttribute('aria-describedby')).toBe(message?.id)
  })

  it('clears the message as soon as the field is edited', () => {
    const el = field('<label><span>Email</span><input name="email" required /></label>') as HTMLInputElement
    el.dispatchEvent(new Event('invalid', { cancelable: true }))
    expect(el.nextElementSibling?.hasAttribute('data-field-error')).toBe(true)

    el.value = 'someone@example.com'
    el.dispatchEvent(new Event('input', { bubbles: true }))

    expect(el.nextElementSibling?.hasAttribute('data-field-error') ?? false).toBe(false)
    expect(el.hasAttribute('aria-invalid')).toBe(false)
  })

  it('shows one message per field, not one per attempt', () => {
    const el = field('<label><span>Email</span><input name="email" required /></label>')
    el.dispatchEvent(new Event('invalid', { cancelable: true }))
    el.dispatchEvent(new Event('invalid', { cancelable: true }))
    expect(document.querySelectorAll('[data-field-error]')).toHaveLength(1)
  })
})

import { describe, it, expect } from 'vitest'
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_VALUES,
  DOCUMENT_VISIBILITIES,
  DOCUMENT_VISIBILITY_VALUES,
} from '@/lib/documents/categories'
import { validateCreateDocumentInput } from '@/lib/services/resources'

/**
 * The taxonomy is offered by the UI and enforced by validation, and those were separate lists
 * of the same strings - the categories written out again in a z.enum, the visibilities a
 * third time in a hand-written guard. Nothing fails while the copies agree; the cost lands
 * the day a value is added to one, because the UI then offers something validation refuses
 * and the person is told their perfectly ordinary choice is invalid.
 *
 * Asserted as behaviour rather than wiring: every value the pickers can offer must survive
 * validation.
 */
const CLASS_ID = '11111111-1111-4111-8111-111111111111'
const base = { classId: CLASS_ID, title: 'A document', url: 'https://drive.google.com/file/d/abc/view' }

describe('document taxonomy: what the UI offers, validation accepts', () => {
  it('accepts every category the pickers render', () => {
    for (const category of DOCUMENT_CATEGORIES) {
      const parsed = validateCreateDocumentInput({ ...base, category: category.value } as never)
      expect(parsed.category, `${category.value} is offered but rejected`).toBe(category.value)
    }
  })

  it('accepts every visibility the pickers render', () => {
    for (const visibility of DOCUMENT_VISIBILITIES) {
      const parsed = validateCreateDocumentInput({ ...base, visibility: visibility.value } as never)
      expect(parsed.visibility, `${visibility.value} is offered but rejected`).toBe(visibility.value)
    }
  })

  it('still refuses a value on neither list', () => {
    expect(() => validateCreateDocumentInput({ ...base, category: 'invented' } as never)).toThrow()
    expect(() => validateCreateDocumentInput({ ...base, visibility: 'everyone' } as never)).toThrow()
  })

  it('the derived value lists match their source lists exactly', () => {
    expect(DOCUMENT_CATEGORY_VALUES).toEqual(DOCUMENT_CATEGORIES.map((c) => c.value))
    expect(DOCUMENT_VISIBILITY_VALUES).toEqual(DOCUMENT_VISIBILITIES.map((v) => v.value))
  })
})

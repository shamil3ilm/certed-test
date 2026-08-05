/**
 * Fixed document taxonomy - the four predefined categories (no user-created
 * tags) and the two visibility levels. Shared by the data layer, services, the
 * RBAC guard, and the UI so the application uses one TypeScript definition.
 * Presentation-only (no server imports) so client components can render the
 * labels.
 */

export const DOCUMENT_CATEGORIES = [
  { value: 'question_papers', label: 'Question Papers' },
  { value: 'practice_sheets', label: 'Practice Sheets' },
  { value: 'academic_resources', label: 'Academic Resources' },
  { value: 'general_documents', label: 'General Documents' },
] as const

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]['value']

export const DOCUMENT_CATEGORY_VALUES = DOCUMENT_CATEGORIES.map((c) => c.value) as DocumentCategory[]

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORY_VALUES as string[]).includes(value)
}

export function documentCategoryLabel(value: DocumentCategory): string {
  return DOCUMENT_CATEGORIES.find((c) => c.value === value)?.label ?? 'General Documents'
}

export const DOCUMENT_VISIBILITIES = [
  { value: 'class', label: 'Whole class' },
  { value: 'staff', label: 'Staff only' },
] as const

export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number]['value']

export function isDocumentVisibility(value: string): value is DocumentVisibility {
  return value === 'class' || value === 'staff'
}

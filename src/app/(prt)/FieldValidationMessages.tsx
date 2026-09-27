'use client'

import { useEffect } from 'react'
import { attachFieldValidationMessages } from '@/lib/ui/field-validation'

/**
 * Replaces the browser's validation bubble with the app's own message under the field, for every
 * form in the portal (including sign-in and register, which this layout also wraps). Renders
 * nothing itself - see src/lib/ui/field-validation.ts for what it listens to and why.
 */
export function FieldValidationMessages() {
  useEffect(() => attachFieldValidationMessages(document), [])
  return null
}

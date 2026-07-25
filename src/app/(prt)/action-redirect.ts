/**
 * Builds the `/classroom/...?error=...` redirect target that native `<form action>`
 * server actions send the user back to when a service call throws (so the error
 * shows as an inline banner instead of crashing the action). One helper for the
 * announcement / classwork / people forms, which each carry the class id under a
 * slightly different field.
 */
export function classErrorUrl(
  formData: FormData,
  opts: { fields?: string[]; sub?: string; error?: string } = {},
): string {
  const fields = opts.fields ?? ['class_id', 'id']
  const classId = fields.map((field) => String(formData.get(field) ?? '')).find(Boolean) ?? ''
  const sub = opts.sub ? `/${opts.sub}` : ''
  const error = opts.error ?? '1'
  return classId ? `/classroom/${classId}${sub}?error=${error}` : `/classroom?error=${error}`
}

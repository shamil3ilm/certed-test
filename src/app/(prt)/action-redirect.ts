/**
 * Builds the `/classroom/...?error=…` or `?saved=…` redirect target that native
 * `<form action>` server actions send the user back to - an error shows as an
 * inline banner instead of crashing the action, and a success shows a confirmation
 * banner instead of silently revalidating. One helper for the announcement /
 * classwork / people / attendance forms, which each carry the class id under a
 * slightly different field.
 */
function classResultUrl(
  formData: FormData,
  key: 'error' | 'saved',
  value: string,
  opts: { fields?: string[]; sub?: string },
): string {
  const fields = opts.fields ?? ['class_id', 'id']
  const classId = fields.map((field) => String(formData.get(field) ?? '')).find(Boolean) ?? ''
  const sub = opts.sub ? `/${opts.sub}` : ''
  return classId ? `/classroom/${classId}${sub}?${key}=${value}` : `/classroom?${key}=${value}`
}

export function classErrorUrl(
  formData: FormData,
  opts: { fields?: string[]; sub?: string; error?: string } = {},
): string {
  return classResultUrl(formData, 'error', opts.error ?? '1', opts)
}

export function classSavedUrl(
  formData: FormData,
  opts: { fields?: string[]; sub?: string; saved?: string } = {},
): string {
  return classResultUrl(formData, 'saved', opts.saved ?? '1', opts)
}

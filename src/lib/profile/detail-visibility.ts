/**
 * Visibility tiers for the person-detail fields (migration 0064) - the single source
 * of truth for WHO may see each field, so no classmate-facing view leaks private or
 * admin-internal data.
 *
 *  - ADMIN_ONLY : admin / sub-admin only (operational / internal), e.g. the joined date.
 *  - PRIVATE    : the person themselves + admin. Personal contact / PII.
 *  - SHARED     : relevant academic people (a student's tutors, a tutor's students) and
 *                 classmate-facing surfaces.
 *
 * Rule: classmate-facing views (the class People tab) may render ONLY `SHARED` fields.
 * That view currently shows name + role only - a strict subset of SHARED - so it is
 * already compliant; if it grows, gate each field with {@link canViewDetailField}.
 */
export type ProfileDetailField =
  | 'country'
  | 'class_level'
  | 'phone'
  | 'guardian_name'
  | 'guardian_phone'
  | 'date_of_birth'
  | 'gender'
  | 'address'
  | 'joined_on'
  | 'qualifications'
  | 'bio'

export type DetailViewer = 'admin' | 'self' | 'other'

export const ADMIN_ONLY_DETAIL_FIELDS = ['joined_on'] as const
export const PRIVATE_DETAIL_FIELDS = [
  'phone',
  'guardian_name',
  'guardian_phone',
  'date_of_birth',
  'gender',
  'address',
] as const
export const SHARED_DETAIL_FIELDS = ['country', 'class_level', 'qualifications', 'bio'] as const

/** May `viewer` see `field`? Admin sees all; the person sees all but admin-only; a
 *  classmate / other academic person sees only SHARED fields. */
export function canViewDetailField(field: ProfileDetailField, viewer: DetailViewer): boolean {
  if (viewer === 'admin') return true
  if ((ADMIN_ONLY_DETAIL_FIELDS as readonly string[]).includes(field)) return false
  if (viewer === 'self') return true
  return (SHARED_DETAIL_FIELDS as readonly string[]).includes(field)
}

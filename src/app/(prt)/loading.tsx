import { PageSkeleton } from './PageSkeleton'

/** Default portal skeleton (max-w-5xl, matching the wide pages: dashboard,
 *  classroom, users, history, grading). Narrower sections override this with
 *  their own loading.tsx passing a matching width, so the skeleton width never
 *  jumps when the real content resolves. */
export default function PortalLoading() {
  return <PageSkeleton />
}

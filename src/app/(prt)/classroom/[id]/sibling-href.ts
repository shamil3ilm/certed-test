/**
 * Swap the class id in a Classroom path, keeping the sub-page AND the query:
 * `/classroom/A/attendance?date=2026-09-06` -> `/classroom/B/attendance?date=2026-09-06`.
 *
 * Pure and separate from the component so the path handling can be tested directly - this
 * is the part that decides where a reader lands, and getting it wrong drops them at the
 * stream from wherever they were, which is exactly what the switcher exists to avoid.
 *
 * The query carries as much of "where they were" as the path does. Attendance is the case
 * that shows it: a tutor comparing Monday across two subjects is on ?date=, and dropping it
 * lands them on today - the same subject, silently a different day, which is a worse answer
 * than not moving at all.
 */
export function siblingHref(pathname: string, fromId: string, toId: string, search = ''): string {
  const query = search && search !== '?' ? (search.startsWith('?') ? search : `?${search}`) : ''
  const prefix = `/classroom/${fromId}`
  // Only continue a path that really is this class's: a suffix match on the id alone would
  // rewrite an unrelated route that merely contained it.
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return `/classroom/${toId}`
  return `/classroom/${toId}${pathname.slice(prefix.length)}${query}`
}

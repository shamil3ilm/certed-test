/**
 * The kinds of notice a person may mute, and the words that describe them. The single source for
 * the settings form, the service's validation and the notification writer; the database CHECK on
 * `notification_mutes.key` (0125) lists the same keys and a test holds the two together.
 *
 * Only classroom activity is here. What happens to an account, its credentials, its money or a
 * mentorship is never optional, so those kinds are absent rather than flagged.
 *
 * A key is usually a notification's own kind. `attendance_present` is the exception: the routine
 * "marked present" notice is stored as an `attendance` notification but muted under its own key,
 * so a mentor can silence it and still hear about an absence or a late arrival.
 */
export const MUTABLE_NOTIFICATION_KEYS = [
  { key: 'message', label: 'Messages', hint: 'New direct and group messages.' },
  { key: 'announcement', label: 'Announcements and meetings', hint: 'Posts to a class, and meeting links.' },
  { key: 'assignment', label: 'New and changed work', hint: 'New assignments, deadlines, marks and reopened work.' },
  { key: 'grade', label: 'Grades', hint: 'When work is graded.' },
  { key: 'submission', label: 'Submissions', hint: 'When work is turned in or withdrawn.' },
  { key: 'resource', label: 'Documents', hint: 'Documents posted, updated or removed.' },
  { key: 'schedule', label: 'Timetable and calendar', hint: 'Class times, events, holidays, cancellations.' },
  {
    key: 'attendance',
    label: 'Attendance',
    hint: 'A record of your attendance, an absence or late arrival, a cleared record, a changed joined time.',
  },
  {
    key: 'attendance_present',
    label: 'Attendance: mentee marked present',
    hint: 'For mentors: the routine notice that a mentee attended. Absences and late arrivals still reach you.',
  },
  {
    key: 'class',
    label: 'Classes and sessions',
    hint: 'Joining or leaving a class, tutor changes, session summaries and feedback.',
  },
] as const

export type MutableNotificationKey = (typeof MUTABLE_NOTIFICATION_KEYS)[number]['key']

const MUTABLE = new Set<string>(MUTABLE_NOTIFICATION_KEYS.map((k) => k.key))

/** Whether this kind of notice can be muted at all. */
export function isMutableNotificationKey(key: string): key is MutableNotificationKey {
  return MUTABLE.has(key)
}

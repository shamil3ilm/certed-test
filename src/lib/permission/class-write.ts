import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { teachesClass, teachesClassWrite } from '@/lib/auth/class-scope'

/**
 * App-layer mirror of the Postgres `teaches_class_write` RLS scope function -- the WRITE
 * scope that the class-scoped write policies (calendar events, timetable slots, resources,
 * assignments, announcements, meet links) gate on since 0079 split the old `teaches_class`
 * into a read scope and this narrower write scope. Calling the SAME SECURITY DEFINER
 * function via RPC is the whole point: a write that passes this guard is never rejected by
 * RLS (a mismatch surfaces as a raw 500). Admin may write anything; a tutor only a class
 * they teach; a global (null class_id) write is admin-only.
 *
 * A mentor is deliberately NOT granted write here: 0079's teaches_class_write drops the
 * mentor branch (oversight is read-only; a mentor's only write authority is attendance,
 * via its own manageAttendance-gated service path, not this RLS-scoped path). So a mentor
 * -- even one an admin grants a manageCalendar override to -- is denied here CLEANLY,
 * rather than passing a looser app guard and then hitting an RLS denial as a 500.
 * Widening a mentor's calendar-write authority would mean widening teaches_class_write in
 * the DB, not loosening this mirror. (Mock mode has no RLS, so this guard is the only gate
 * there; the mock's teaches_class_write is the same tutor-of-class lookup.)
 */
export async function canWriteClass(profile: Profile, classId: string | null): Promise<boolean> {
  const { isAdmin, isSubAdmin, isClassAdmin } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  if (classId == null) return false
  // A sub_admin manages classes academy-wide. Requires BOTH the persona and the RESOLVED
  // manageClasses capability:
  //   - the PERSONA, because 0092's teaches_class_write checks the persona too, so keying
  //     on the capability alone would let an override grant someone authority RLS denies -
  //     a permitted-looking write that 500s.
  //   - the CAPABILITY, because a deny override must actually strip academy-wide class
  //     authority rather than merely grey out the UI while writes keep working (C-09).
  // Requiring both can only make this guard TIGHTER than RLS, which fails closed.
  if (isSubAdmin && isClassAdmin) return true
  return teachesClassWrite(classId)
}

/**
 * Calendar/timetable WRITE scope: admin, a tutor of the class, OR a mentor of a student
 * enrolled in it. Mirrors the Postgres `teaches_class` scope that calendar_events_write /
 * timetable_slots_write gate on (0082) - deliberately BROADER than canWriteClass (which
 * mirrors the tutor-only teaches_class_write that content policies use). A mentor may
 * manage their mentee's class calendar (one-off events + timetable slots) to coordinate
 * mentoring; announcements/resources/assignments stay tutor-only. A global (null class)
 * write is admin-only. App guard and RLS agree by calling the same SECURITY DEFINER RPC.
 */
export async function canWriteCalendar(profile: Profile, classId: string | null): Promise<boolean> {
  const { isAdmin, isSubAdmin } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  if (classId == null) return false
  if (isSubAdmin) return true // mirrors 0092's teaches_class, which admits sub_admin
  return teachesClass(classId)
}

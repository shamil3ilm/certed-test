import 'server-only'
import { getActorContext } from '@/lib/session/actor-context'

/**
 * May this actor write the staff-PRIVATE note on a class session?
 *
 * A higher bar than the session's times and student-shared summary, which any manageAttendance
 * holder may edit - mentors included, since overseeing a mentee's hours is part of that role.
 * The note is staff-only, so it takes manageClassContent, which a mentor does not hold.
 *
 * It lives in one place because `saveSessionTimes` trusts the boolean its CALLER derives: when
 * the flag is false the field is omitted from the write entirely, preserving an existing note,
 * and when it is true the note is written. Passing true where it should be false hands a mentor
 * write access to the staff-private note about their own mentee. One definition means the form
 * that hides the field and the action that writes it cannot drift apart.
 */
export async function canEditStaffNote(): Promise<boolean> {
  return (await getActorContext()).capabilities.allowed.has('manageClassContent')
}

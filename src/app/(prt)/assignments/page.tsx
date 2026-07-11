import { redirect } from 'next/navigation'

// Assignments are now class-scoped — see a class's Classwork under /classroom.
// (The per-assignment submission review page /assignments/[id] is still active.)
export default function AssignmentsPage() {
  redirect('/classroom')
}

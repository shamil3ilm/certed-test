import { redirect } from 'next/navigation'

// Announcements are now class-scoped — see a class Stream under /classroom.
export default function AnnouncementsPage() {
  redirect('/classroom')
}

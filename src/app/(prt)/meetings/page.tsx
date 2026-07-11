import { redirect } from 'next/navigation'

// Meetings are now folded into each class Stream under /classroom.
export default function MeetingsPage() {
  redirect('/classroom')
}

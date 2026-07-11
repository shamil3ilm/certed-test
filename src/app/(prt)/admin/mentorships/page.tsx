import { redirect } from 'next/navigation'

// Mentor management now lives under Users → Mentors.
export default function MentorshipsPage() {
  redirect('/admin/users?tab=mentors')
}

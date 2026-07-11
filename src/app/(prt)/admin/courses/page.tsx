import { redirect } from 'next/navigation'

// Courses and Classes are the same thing — management now lives inside each
// class (Classes → a class → People). This route just redirects.
export default function CoursesPage() {
  redirect('/classroom')
}

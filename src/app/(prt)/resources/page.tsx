import { redirect } from 'next/navigation'

// Resources are now class-scoped — see a class's Classwork under /classroom.
export default function ResourcesPage() {
  redirect('/classroom')
}

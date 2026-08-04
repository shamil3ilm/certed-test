import { redirect } from 'next/navigation'

// Grading lives in a per-class tab (Classroom -> Grading), not a top-level queue.
// This stub keeps /grading links and bookmarks working by sending them to the
// class list, where each class carries its own queue.
export default function GradingRedirect() {
  redirect('/classroom')
}

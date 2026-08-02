import { redirect } from 'next/navigation'

// Grading moved from a top-level cross-class queue to a per-class tab
// (Classroom -> Grading). This stub keeps old links/bookmarks working by
// sending them to the class list, where each class carries its own queue.
export default function GradingRedirect() {
  redirect('/classroom')
}

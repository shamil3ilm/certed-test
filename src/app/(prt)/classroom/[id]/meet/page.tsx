import { redirect } from 'next/navigation'

// Meetings merged back into the class Stream (a post with a join link IS a
// meeting), so the standalone Meet tab is gone. Keep the route working by
// sending any old link to the stream.
export default function ClassMeetRedirect({ params }: { params: { id: string } }) {
  redirect(`/classroom/${params.id}`)
}

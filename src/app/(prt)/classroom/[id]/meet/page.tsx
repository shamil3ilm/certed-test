import { redirect } from 'next/navigation'

// Meetings merged back into the class Stream (a post with a join link IS a
// meeting), so the standalone Meet tab is gone. Keep the route working by
// sending any old link to the stream.
export default async function ClassMeetRedirect(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  redirect(`/classroom/${params.id}`)
}

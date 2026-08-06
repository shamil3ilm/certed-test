import { redirect } from 'next/navigation'

// A meeting is just a Stream post carrying a join link, so the class Stream is
// the single home for meetings; this route resolves /classroom/[id]/meet to it.
export default async function ClassMeetRedirect(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  redirect(`/classroom/${params.id}`)
}

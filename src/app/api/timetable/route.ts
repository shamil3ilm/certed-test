import { listHandler, createHandler } from '@/lib/api/route-handlers'
import { getActorContext } from '@/lib/session/actor-context'
import { createSlotFromApiInput, listSlots } from '@/lib/services/timetable-slots'

export const GET = listHandler('viewCalendar', async (request) => {
  const url = new URL(request.url)
  // The timetable manager lists deactivated slots too, so they can be reactivated or deleted.
  // Everyone else - students included - gets the active timetable only.
  const includeInactive =
    url.searchParams.get('includeInactive') === '1' &&
    (await getActorContext()).capabilities.allowed.has('manageCalendar')
  return listSlots({
    classId: url.searchParams.get('classId') ?? undefined,
    activeOnly: !includeInactive,
    limit: 500,
  })
})

export const POST = createHandler('manageCalendar', createSlotFromApiInput)

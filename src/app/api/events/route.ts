import { listHandler, createHandler } from '@/lib/api/route-handlers'
import { createEventFromApiInput, listEvents } from '@/lib/services/calendar-events'

export const GET = listHandler('viewCalendar', (request) => {
  const url = new URL(request.url)
  return listEvents({
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    limit: 500,
  })
})

export const POST = createHandler('manageCalendar', createEventFromApiInput)

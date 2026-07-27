import { listHandler, createHandler } from '@/lib/api/route-handlers'
import { createSlotFromApiInput, listSlots } from '@/lib/services/timetable-slots'

export const GET = listHandler('viewCalendar', (request) => {
  const url = new URL(request.url)
  return listSlots({ classId: url.searchParams.get('classId') ?? undefined, activeOnly: true, limit: 500 })
})

export const POST = createHandler('manageCalendar', createSlotFromApiInput)

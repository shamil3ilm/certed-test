import { updateHandler, deleteHandler } from '@/lib/api/route-handlers'
import { updateEventFromApiInput, deleteEventFromApiInput } from '@/lib/services/calendar-events'

export const PATCH = updateHandler('manageCalendar', updateEventFromApiInput)

export const DELETE = deleteHandler('manageCalendar', deleteEventFromApiInput)

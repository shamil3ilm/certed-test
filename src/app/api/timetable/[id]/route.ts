import { updateHandler, deleteHandler } from '@/lib/api/route-handlers'
import { updateSlotFromApiInput, deactivateSlotFromApiInput } from '@/lib/services/timetable-slots'

export const PATCH = updateHandler('manageCalendar', updateSlotFromApiInput)

// Soft-delete: return the deactivated slot row (not just { id }).
export const DELETE = deleteHandler('manageCalendar', deactivateSlotFromApiInput, (_id, slot) => slot)

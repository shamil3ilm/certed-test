import { updateHandler, deleteHandler } from '@/lib/api/route-handlers'
import { updateSlotFromApiInput, deleteSlotFromApiInput } from '@/lib/services/timetable-slots'

export const PATCH = updateHandler('manageCalendar', updateSlotFromApiInput)

// A real delete, not a second deactivate. PATCH { active: false } is the pause; this removes
// the slot. Returns the row it removed (not just { id }) so the client can report what went.
export const DELETE = deleteHandler('manageCalendar', deleteSlotFromApiInput, (_id, slot) => slot)

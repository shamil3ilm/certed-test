import 'server-only'
import {
  selectAssignmentById,
  selectAssignments,
  type AssignmentFilters,
  type AssignmentRow,
} from '@/lib/data/assignments'

/** Reading assignments. RLS scopes these to the classes the caller belongs to.
 *  Table access is in src/lib/data/assignments. */

export type Assignment = AssignmentRow

/**
 * Assignments, optionally scoped. Passing a due-date window keeps the calendar
 * from loading every assignment ever created (bounds grow-over-time).
 */
export async function listAssignments(opts: AssignmentFilters = {}): Promise<Assignment[]> {
  return selectAssignments(opts)
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  return selectAssignmentById(id)
}

import 'server-only'
import { toRange, type Page } from '@/lib/pagination'
import {
  selectAssignmentById,
  selectAssignments,
  selectAssignmentPage,
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

/** ONE page of a class's assignments, with the viewer's visibility rule pushed into the
 *  query so the pager's total matches what is rendered. */
export async function listAssignmentPage(
  classId: string,
  opts: { page: number; pageSize: number },
  visible?: { activeOnly: true; alsoIds: string[] },
): Promise<Page<Assignment>> {
  return selectAssignmentPage(classId, toRange(opts.page, opts.pageSize), visible)
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  return selectAssignmentById(id)
}

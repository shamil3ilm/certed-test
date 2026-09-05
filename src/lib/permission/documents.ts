import type { Profile } from '@/lib/auth/profile'
import { PermissionError } from '@/lib/errors'
import { canAccessClass } from '@/lib/permission/class'
import { canWriteClass } from '@/lib/permission/class-write'
import { loadPersonaFlags } from '@/lib/permission/personas'
import type { DocumentVisibility } from '@/lib/documents/categories'

/**
 * Role-based document permissions.
 *
 * Two layers, both enforced on the server:
 *  1. This MATRIX - what each role may do in principle (configurable: it is the
 *     single source of truth; swap it for a DB-backed table later without
 *     touching callers).
 *  2. Class scope + ownership - a manage action still requires canWriteClass
 *     (admin / tutor-of-class, mirroring the tutor-only `teaches_class_write` the
 *     content RLS policies use), a view action requires canAccessClass, and an
 *     `own` matrix entry requires the caller to be the uploader.
 *
 * Never gate a document write on the matrix alone - always through canDocument.
 */

export type DocumentAction = 'view' | 'upload' | 'edit' | 'delete' | 'download' | 'share'
export type DocumentRole = 'admin' | 'mentor' | 'tutor' | 'student'

/** 'yes' = allowed, 'own' = allowed only on documents the caller uploaded,
 *  'no' = never. */
type MatrixEntry = 'yes' | 'own' | 'no'

export const DOCUMENT_PERMISSION_MATRIX: Record<DocumentRole, Record<DocumentAction, MatrixEntry>> = {
  // Full control.
  admin: { view: 'yes', upload: 'yes', edit: 'yes', delete: 'yes', download: 'yes', share: 'yes' },
  // Pastoral OVERSIGHT only: a mentor may VIEW/DOWNLOAD their mentees' class documents, but
  // NOT author them. Content authoring (upload/edit/delete/share) is tutor-only - a mentor
  // holds no manageClassContent capability, so the matrix must match. A mentor who
  // also teaches gets write access through their separate tutor persona.
  mentor: { view: 'yes', upload: 'no', edit: 'no', delete: 'no', download: 'yes', share: 'no' },
  // Uploads to classes they teach; may edit/delete only what they uploaded.
  tutor: { view: 'yes', upload: 'yes', edit: 'own', delete: 'own', download: 'yes', share: 'yes' },
  // Consumes only: view allowed documents, download if permitted; no write/share.
  student: { view: 'yes', upload: 'no', edit: 'no', delete: 'no', download: 'yes', share: 'no' },
}

const MANAGE_ACTIONS: ReadonlySet<DocumentAction> = new Set(['upload', 'edit', 'delete', 'share'])

type PersonaFlags = Awaited<ReturnType<typeof loadPersonaFlags>>

/** The document role this actor holds. A person may hold several personas; class
 *  scope (below) still confines mentor/tutor powers to the relevant classes.
 *
 *  A tutor is matched BEFORE the mentor branch, and the mentor branch keys on the
 *  DEDICATED mentor identity (isMentor), not hasMentorAuthority. Otherwise a
 *  tutor who also mentors one student - which sets hasMentorAuthority - would resolve
 *  to the mentor row and silently upgrade their edit/delete scope from 'own' (only
 *  documents they uploaded) to 'yes' (any document in a class they teach). Mentoring a
 *  student must never widen a tutor's authorship rights. */
export function documentRoleFor(flags: PersonaFlags): DocumentRole {
  if (flags.isAdmin) return 'admin'
  // A sub_admin manages class content academy-wide (manageClassContent), so it takes the
  // full-control row rather than falling through to 'student'. Ranked above tutor because
  // its authority is academy-wide, not limited to classes it is assigned to teach.
  //
  // isClassAdmin, not the raw persona: it is the SAME sub_admin authority resolved against
  // admin overrides, so an explicit deny actually removes the academy-wide content rights
  // instead of leaving them working behind a greyed-out UI (C-09). A sub_admin whose
  // authority was denied falls through to the tutor/student rows like anyone else.
  if (flags.isSubAdmin && flags.isClassAdmin) return 'admin'
  if (flags.isTutor) return 'tutor'
  if (flags.isMentor) return 'mentor'
  return 'student'
}

/** The target of a permission check. For `upload` only `class_id` (and the
 *  intended `visibility`) is known - there is no row yet. */
export type DocumentTarget = {
  class_id: string
  uploaded_by?: string | null
  visibility?: DocumentVisibility
}

/** May `actor` perform `action` on this document/target? Combines the matrix,
 *  class scope, ownership, and the student visibility gate. */
export async function canDocument(actor: Profile, action: DocumentAction, target: DocumentTarget): Promise<boolean> {
  const flags = await loadPersonaFlags(actor.id)
  const role = documentRoleFor(flags)
  const entry = DOCUMENT_PERMISSION_MATRIX[role][action]
  if (entry === 'no') return false

  // A manage action needs class WRITE authority, a read needs class access. Writing is
  // gated on canWriteClass (tutor-of-class or admin), NOT canManageClass: canManageClass
  // also admits a mentor of an enrolled student, which is looser than the tutor-only
  // `teaches_class_write` the resource/assignment/announcement RLS policies use. A caller
  // who passed the looser guard would reach the DB and be refused there - surfacing as a
  // raw 500 instead of a clean denial. Mirroring the RLS scope keeps app and DB in step.
  const scoped = MANAGE_ACTIONS.has(action)
    ? await canWriteClass(actor, target.class_id)
    : await canAccessClass(actor, target.class_id)
  if (!scoped) return false

  // `own` entries (tutor edit/delete) require the caller to be the uploader.
  if (entry === 'own' && (!target.uploaded_by || target.uploaded_by !== actor.id)) return false

  // A student can never view/download a staff-only document (defence-in-depth
  // over the RLS visibility gate in 0045).
  if (role === 'student' && (action === 'view' || action === 'download') && target.visibility === 'staff') {
    return false
  }

  return true
}

/** Throwing variant for service write paths. */
export async function assertCanDocument(actor: Profile, action: DocumentAction, target: DocumentTarget): Promise<void> {
  if (!(await canDocument(actor, action, target))) {
    throw new PermissionError(`Not allowed to ${action} this document.`)
  }
}

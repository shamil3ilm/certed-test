import 'server-only'
import { documentCategoryLabel } from '@/lib/documents/categories'
import { notifyClassRoleBestEffort } from '@/lib/services/notifications'
import type { Document } from './queries'

/** Tell a class's students a document was posted/updated. Best-effort (the write
 *  is already committed), and only for class-visible documents - a staff-only
 *  document must not surface to students, even as a notification. */
export async function notifyClassOfDocument(doc: Document, action: 'New document' | 'Updated document'): Promise<void> {
  if (doc.visibility !== 'class') return
  await notifyClassRoleBestEffort(doc.class_id, 'students', {
    kind: 'resource',
    title: `${action}: ${doc.title}`,
    body: doc.subject ?? documentCategoryLabel(doc.category),
    link: `/classroom/${doc.class_id}/classwork#materials`,
  })
}

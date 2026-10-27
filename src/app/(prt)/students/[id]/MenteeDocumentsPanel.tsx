import Link from 'next/link'
import { documentCategoryLabel } from '@/lib/documents/categories'
import { listRecentResourcesForClasses } from '@/lib/services/resources'
import { Badge, Panel } from '@/lib/ui'
import { LocalTime } from '../../LocalTime'
import { EmptyLine } from './detail-shared'

const DOCUMENT_LIMIT = 10

/**
 * The newest documents in the classes this mentee is enrolled in and the reader may open - the
 * materials the student is working from, so a mentor sees them without opening class after class.
 *
 * Reads through the reader's own session: the database decides which documents come back, staff-only
 * ones included for a mentor. `classes` is the page's own list, already narrowed to the classes the
 * reader may open, so a class shown only for context contributes nothing here.
 */
export async function MenteeDocumentsPanel({
  classes,
  openableClassIds,
}: {
  classes: Array<{ id: string; name: string }>
  openableClassIds: string[]
}) {
  const openable = new Set(openableClassIds)
  const names = new Map(classes.filter((c) => openable.has(c.id)).map((c) => [c.id, c.name]))
  const documents = await listRecentResourcesForClasses([...names.keys()], DOCUMENT_LIMIT)

  return (
    <section id="documents" className="mt-4 scroll-mt-20">
      <Panel title="Class documents">
        {documents.length === 0 ? (
          <EmptyLine>No documents have been shared in this mentee&apos;s classes yet.</EmptyLine>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link
                    href={`/classroom/${doc.class_id}/classwork#materials`}
                    className="block truncate font-medium text-slate-800 hover:underline"
                  >
                    {doc.title}
                  </Link>
                  <p className="truncate text-xs text-slate-600">
                    {names.get(doc.class_id) ?? 'Class'} - {documentCategoryLabel(doc.category)} -{' '}
                    <LocalTime iso={doc.created_at} mode="date" />
                  </p>
                </div>
                {doc.visibility === 'staff' && <Badge tone="warning">Staff only</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  )
}

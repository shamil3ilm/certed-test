import type { DocumentVersion } from '@/lib/services/resources'
import { LocalTime } from '../LocalTime'
import { ConfirmSubmit } from '../ConfirmSubmit'
import { restoreVersionAction } from '../assignments/manage-actions'
import { ExternalActionLink } from '@/lib/ui'

/** A document's superseded versions. Collapsed by default; anyone
 *  who can see the document sees its history, and staff can restore a prior
 *  version as the live one. Nothing renders when there is no history. */
export function VersionHistory({
  resourceId,
  classId,
  versions,
  canManage,
}: {
  resourceId: string
  classId: string
  versions: DocumentVersion[]
  canManage: boolean
}) {
  if (versions.length === 0) return null
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium text-primary transition hover:underline">
        Version history ({versions.length})
      </summary>
      <ul className="mt-2 space-y-2">
        {versions.map((version) => (
          <li
            key={version.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs"
          >
            <span className="font-semibold text-slate-700">v{version.version_no}</span>
            <span className="min-w-0 flex-1 truncate text-slate-600">{version.title}</span>
            {version.note && <span className="shrink-0 text-slate-400">{version.note}</span>}
            <span className="shrink-0 text-slate-400">
              <LocalTime iso={version.created_at} mode="date" />
            </span>
            {version.drive_link && (
              <ExternalActionLink href={version.drive_link} className="shrink-0">
                Open
              </ExternalActionLink>
            )}
            {canManage && (
              <form action={restoreVersionAction} className="shrink-0">
                <input type="hidden" name="resourceId" value={resourceId} />
                <input type="hidden" name="versionId" value={version.id} />
                <input type="hidden" name="class_id" value={classId} />
                <ConfirmSubmit
                  className="btn btn-sm btn-soft"
                  title={`Restore v${version.version_no}?`}
                  message="This becomes the live document; the current version is kept in history."
                  confirmLabel="Restore"
                >
                  Restore
                </ConfirmSubmit>
              </form>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

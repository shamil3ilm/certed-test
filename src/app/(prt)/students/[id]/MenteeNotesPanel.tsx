import { Card, EmptyState } from '@/lib/ui'
import { LocalTime } from '../../LocalTime'
import { SubmitButton } from '../../form'
import { addMenteeNoteAction } from './note-actions'
import type { MenteeNoteRow } from '@/lib/data/mentee-notes'

/**
 * A mentor's pastoral notes about this mentee. Private to the student's mentor(s) and
 * admins - the student never sees them. Append-only: add via the form, no edit/delete.
 */
export function MenteeNotesPanel({
  studentId,
  notes,
  authorNames,
}: {
  studentId: string
  notes: MenteeNoteRow[]
  authorNames: Map<string, string>
}) {
  return (
    <Card className="mt-6 p-4">
      <h2 className="text-base font-semibold text-slate-900">Pastoral notes</h2>
      <p className="mt-0.5 text-xs text-slate-400">
        Private to this student&apos;s mentors and admins - the student never sees these.
      </p>

      <form action={addMenteeNoteAction} className="mt-3 space-y-2">
        <input type="hidden" name="student_id" value={studentId} />
        <textarea
          name="body"
          required
          rows={2}
          maxLength={2000}
          placeholder="Add a note about this student..."
          className="block w-full rounded-lg border border-amber-200 bg-amber-50/40 px-2 py-1.5 text-sm"
        />
        <SubmitButton className="btn-sm btn-primary" pendingLabel="Saving...">
          Add note
        </SubmitButton>
      </form>

      {notes.length === 0 ? (
        <EmptyState className="mt-3">No notes yet.</EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {notes.map((n) => (
            <li key={n.id} className="py-2 text-sm">
              <p className="whitespace-pre-wrap text-slate-700">{n.body}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {(n.author_id && authorNames.get(n.author_id)) || 'Staff'} · <LocalTime iso={n.created_at} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

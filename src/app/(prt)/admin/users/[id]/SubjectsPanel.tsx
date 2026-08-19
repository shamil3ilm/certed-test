'use client'
import { Card, EmptyState } from '@/lib/ui'
import { Field, Input, Select, SubmitButton } from '../../../form'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import type { StudentSubject } from '@/lib/services/page-data/user-detail'
import { addSubjectAction, removeSubjectAction } from './actions'

type TutorOption = { id: string; name: string }

/**
 * Manage a student's subjects (each = one of their 1:1 classes) - add a subject with
 * its tutor, or remove one. The subject field is a datalist: pick an existing subject
 * or type a new one (the action's create-or-reuse folds it into the master list).
 * Admin/sub-admin only; the page already gates access.
 */
export function SubjectsPanel({
  studentId,
  subjects,
  tutors,
  subjectNames,
}: {
  studentId: string
  subjects: StudentSubject[]
  tutors: TutorOption[]
  subjectNames: string[]
}) {
  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold text-slate-900">Subjects &amp; tutors</h2>

      {subjects.length === 0 ? (
        <EmptyState className="mt-3">No subjects yet - add one below.</EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {subjects.map((s) => (
            <li key={s.classId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-medium text-slate-900">{s.subjectName}</span>
                {s.tutorName ? (
                  <span className="text-slate-500"> - {s.tutorName}</span>
                ) : (
                  <span className="text-amber-600"> - no tutor yet</span>
                )}
              </span>
              <form action={removeSubjectAction}>
                <input type="hidden" name="student_id" value={studentId} />
                <input type="hidden" name="class_id" value={s.classId} />
                <ConfirmSubmit
                  className="btn btn-sm btn-danger"
                  title="Remove this subject?"
                  message="The class is archived (kept on record) and stops appearing in schedules."
                  confirmLabel="Remove"
                >
                  Remove
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addSubjectAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
        <input type="hidden" name="student_id" value={studentId} />
        <Field label="Subject" className="w-full sm:w-48">
          <Input name="subject" list="subject-list" placeholder="Pick or type…" autoComplete="off" required />
        </Field>
        <Field label="Tutor" className="w-full sm:w-48">
          <Select name="tutor_id" defaultValue="">
            <option value="">Assign later</option>
            {tutors.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton className="btn-primary" pendingLabel="Adding...">
          Add subject
        </SubmitButton>
      </form>

      <datalist id="subject-list">
        {subjectNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </Card>
  )
}

'use client'
import { Card, EmptyState } from '@/lib/ui'
import { Field, Input, Select, SubmitButton } from '../../../form'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import type { StudentSubject } from '@/lib/services/page-data/user-detail'
import { addSubjectAction, addSubjectTutorAction, removeSubjectTutorAction, removeSubjectAction } from './actions'

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
            <li key={s.classId} className="py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-[8rem] font-medium text-slate-900">{s.subjectName}</span>
                <form action={removeSubjectAction}>
                  <input type="hidden" name="student_id" value={studentId} />
                  <input type="hidden" name="class_id" value={s.classId} />
                  <ConfirmSubmit
                    className="btn btn-sm btn-danger"
                    title="Remove this subject?"
                    message={`${s.subjectName}: the class is archived (kept on record) and stops appearing in schedules.`}
                    confirmLabel="Remove"
                    pendingLabel="Removing..."
                    aria-label={`Remove subject ${s.subjectName}`}
                  >
                    Remove
                  </ConfirmSubmit>
                </form>
              </div>
              {/* A subject may have SEVERAL tutors: list each with its own remove, and an
                  add-tutor picker that never touches the others. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {s.tutors.length === 0 ? (
                  <span className="text-xs text-amber-600">No tutor yet</span>
                ) : (
                  s.tutors.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                    >
                      {t.name}
                      <form action={removeSubjectTutorAction} className="contents">
                        <input type="hidden" name="student_id" value={studentId} />
                        <input type="hidden" name="class_id" value={s.classId} />
                        <input type="hidden" name="tutor_id" value={t.id} />
                        {/* ConfirmSubmit, like the two other destructive controls in this
                            file: removeTutor also deactivates the global tutor persona of a
                            mentor account left with no classes - an audited privilege
                            change - and this was the smallest click target on the page. */}
                        <ConfirmSubmit
                          className="text-slate-600 hover:text-red-600"
                          aria-label={`Remove ${t.name}`}
                          title="Remove this tutor?"
                          message={`${t.name} stops teaching ${s.subjectName}. If they are a mentor account with no other classes, their tutor access is removed too.`}
                          confirmLabel="Remove tutor"
                          pendingLabel="Removing..."
                        >
                          ×
                        </ConfirmSubmit>
                      </form>
                    </span>
                  ))
                )}
                <form action={addSubjectTutorAction} className="flex items-center gap-1">
                  <input type="hidden" name="student_id" value={studentId} />
                  <input type="hidden" name="class_id" value={s.classId} />
                  {/* aria-label: one of these renders per subject row, and a bare <select>
                      has no placeholder fallback for its accessible name - so every row
                      presented an identically unnamed combo box. Names it by subject, the
                      way the labelled sibling below is named by <Field label="Tutor">. */}
                  <Select
                    name="tutor_id"
                    defaultValue=""
                    className="w-40"
                    required
                    aria-label={`Add a tutor to ${s.subjectName}`}
                  >
                    <option value="" disabled>
                      Add tutor…
                    </option>
                    {tutors.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton className="btn-soft btn-sm" pendingLabel="Adding...">
                    Add
                  </SubmitButton>
                </form>
              </div>
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

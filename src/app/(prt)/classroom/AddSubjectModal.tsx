'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { AlertBanner, staffPickerLabel } from '@/lib/ui'
import { Modal } from '../Modal'
import { Field, Input, Select, SubmitButton } from '../form'
import { addSubjectForStudentAction, type AddSubjectState } from './class-actions'

/**
 * Its OWN datalist id, never the detail page's `subject-list`.
 *
 * Two elements sharing one DOM id is undefined behaviour - whichever the browser resolves
 * first wins, and a `list=` pointing at the loser silently offers nothing. These two surfaces
 * are not rendered together today, but nothing stops that, and the same mistake with
 * `country-list` was caught once already.
 */
const SUBJECT_DATALIST_ID = 'classroom-add-subject-list'

export type StudentOption = { id: string; name: string }
export type StaffOption = { id: string; name: string; role?: string | null }

const initial: AddSubjectState = {}

/**
 * "Add a subject" on the Classes page - the create this list had no way to reach.
 *
 * A class IS a student's subject (there is no standalone class), so the dialog asks for the
 * student, the subject and the tutor and creates the class for that student. It was a plain
 * link to the student directory before: a primary button promising an action that silently
 * navigates reads as a misrouted link, and the admin then had to find the student themselves.
 *
 * Stays OPEN on both outcomes. On failure, closing would discard the typed subject along with
 * the message explaining it; on success, an admin setting up a timetable adds several subjects
 * in a row, so the student stays selected and only the subject field clears.
 */
export function AddSubjectModal({
  students,
  tutors,
  subjectNames,
}: {
  students: StudentOption[]
  /** Tutors AND mentors - either may be assigned to teach. */
  tutors: StaffOption[]
  subjectNames: string[]
}) {
  const [open, setOpen] = useState(false)
  const [studentId, setStudentId] = useState('')
  const [subject, setSubject] = useState('')
  // useActionState, not react-dom's useFormState: React 19 renamed the hook and the old name
  // logs a console error on every render.
  const [state, formAction] = useActionState(addSubjectForStudentAction, initial)

  /**
   * Whether the latest result belongs to THIS opening of the dialog.
   *
   * Closing the dialog only stops the Modal rendering - the component stays mounted, so
   * useActionState still holds the last result, and there is no way to reset it. Without this
   * an admin who reopens is met by a banner for a submit they have already read, or worse by
   * an error about a subject they are no longer adding. Closing is not a cancel, so the typed
   * fields survive; the message about a finished attempt does not.
   */
  const [resultVisible, setResultVisible] = useState(false)

  // React resets the form once its action completes - on failure too. The subject is the field
  // the admin retypes, so it is held in state (React keeps a controlled input's `value`
  // ATTRIBUTE in step, so a reset restores what is on screen) and cleared HERE, only when the
  // add actually landed. Compared in render rather than in an effect, like AddSeveralButton:
  // the clear belongs to the state transition, not to a paint.
  const [settled, setSettled] = useState(state)
  if (state !== settled) {
    setSettled(state)
    setResultVisible(true)
    if (state.ok) setSubject('')
  }

  /**
   * Re-apply the selected student after the reset above.
   *
   * A controlled <select> carries no `selected` default to reset TO, so the reset lands it back
   * on "Choose a student" while React state still holds the real id - the screen then disagrees
   * with what the next submit will post, on exactly the screen an error sends the admin back
   * to. Written straight back to the DOM after the commit that reset it (the same fix, and the
   * same reason, as the Role/Mentor selects in admin/users/AddSeveralButton).
   */
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const field = formRef.current?.elements.namedItem('student_id')
    if (field instanceof HTMLSelectElement) field.value = studentId
  }, [state, studentId, open])

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setResultVisible(false)
          setOpen(true)
        }}
        className="btn btn-primary btn-sm"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add a subject
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add a subject to a student" size="md">
        <p className="mb-3 text-sm text-slate-600">
          A class is a student&apos;s subject, so this creates the class too. Pick an existing subject or type a new
          one.
        </p>

        {resultVisible && state.error && (
          <AlertBanner tone="warning" className="mb-3">
            {state.error}
          </AlertBanner>
        )}

        {/* Names the student and the subject, from the row that was written - so an admin who
            has already moved on to the next entry can still see what the last one created. */}
        {resultVisible && state.ok && state.added && (
          <AlertBanner tone="success" className="mb-3">
            Added {state.added}.
          </AlertBanner>
        )}

        <form action={formAction} ref={formRef} className="space-y-3">
          <Field label="Student">
            <Select name="student_id" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="">Choose a student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Subject">
            <Input
              name="subject"
              list={SUBJECT_DATALIST_ID}
              placeholder="Pick or type…"
              autoComplete="off"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>

          <Field label="Tutor">
            <Select name="tutor_id" defaultValue="">
              <option value="">Assign later</option>
              {tutors.map((t) => (
                <option key={t.id} value={t.id}>
                  {staffPickerLabel(t)}
                </option>
              ))}
            </Select>
          </Field>

          {/* SubmitButton blocks a second submit while the first is in flight: a double-click
              would otherwise try to create the same subject twice, and the second attempt is
              refused by the one-live-class-per-subject rule with an error about a subject the
              admin just successfully added. */}
          <SubmitButton className="btn-primary" pendingLabel="Adding...">
            Add subject
          </SubmitButton>
        </form>

        <datalist id={SUBJECT_DATALIST_ID}>
          {subjectNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Modal>
    </>
  )
}

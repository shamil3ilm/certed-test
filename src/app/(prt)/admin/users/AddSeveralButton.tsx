'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Plus, UsersRound } from 'lucide-react'
import { AlertBanner, createClientId } from '@/lib/ui'
import { COMMON_COUNTRIES } from '@/lib/geo/countries'
import { MAX_BATCH_ROWS } from '@/lib/services/user-invites-validation'
import { Modal } from '../../Modal'
import { SubmitButton } from '../../form'
import { addUsersBatchAction, type BatchState } from './actions'
import { BatchResults } from './BatchResults'
import {
  AddSeveralRow,
  COUNTRY_DATALIST_ID,
  FIELD_LABELS,
  emptyRow,
  postedRow,
  type BatchRow,
  type MentorCandidate,
  type SharedField,
} from './AddSeveralRow'

const INITIAL_ROWS = 3
const initial: BatchState = {}

const newRow = (role: string): BatchRow => emptyRow(createClientId('batch-row'), role)

/**
 * "Add several" - a modal row editor for one batch of invited accounts.
 *
 * Takes exactly the props AddUserForm takes, so the roles on offer and whether a student may be
 * added at all are inherited from the same server-side decision rather than restated here. The
 * single form is untouched beside it and stays the place for full detail.
 *
 * The results are the feature, not the form: a created code is shown exactly once (ADR-0008),
 * so a successful submit leaves this modal OPEN with BatchResults on top. Closing the modal is
 * what destroys the codes, and nothing here does that on the admin's behalf.
 */
export function AddSeveralButton({
  roles,
  mentorCandidates,
  canAssignMentor = true,
}: {
  roles: string[]
  mentorCandidates: MentorCandidate[]
  /** A student is created with their mentor, so without this capability the role is not offered. */
  canAssignMentor?: boolean
}) {
  const defaultRole = roles[0] ?? 'student'
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<BatchRow[]>(() => Array.from({ length: INITIAL_ROWS }, () => newRow(defaultRole)))
  // useActionState, not react-dom's useFormState: React 19 renamed the hook, and the old
  // name logs a console error on every render.
  const [state, formAction] = useActionState(addUsersBatchAction, initial)

  const setRow = (index: number, patch: Partial<BatchRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const addRow = () =>
    setRows((current) => (current.length >= MAX_BATCH_ROWS ? current : [...current, newRow(defaultRole)]))

  const removeRow = (index: number) => setRows((current) => current.filter((_, i) => i !== index))

  /** Copy one field from the first student row into every student row below it. A cohort
   *  usually shares all three, and typing the same class twenty times is where typos live. */
  const copyDown = (from: number, field: SharedField) =>
    setRows((current) => {
      const value = current[from]?.[field] ?? ''
      return current.map((row, i) => (i > from && row.role === 'student' ? { ...row, [field]: value } : row))
    })

  const atCap = rows.length >= MAX_BATCH_ROWS
  // The copy-down control belongs on the row whose values get copied, so there is exactly one
  // of it and it is next to the fields it reads.
  const firstStudent = rows.findIndex((row) => row.role === 'student')
  const studentsBelow = rows.filter((row, i) => i > firstStudent && row.role === 'student').length

  // An error is shown on the row it names. Two kinds are not row-shaped: `field: 'rows'` (the
  // batch is empty, or over the cap) and an index past the end, which happens when a row is
  // removed after a failed submit. Both go to the banner rather than nowhere.
  const rowErrors = state.outcome?.errors ?? []
  const inlineErrors = new Map<number, string[]>()
  const batchErrors: string[] = []
  for (const error of rowErrors) {
    const label = FIELD_LABELS[error.field]
    if (!label || error.index >= rows.length) {
      batchErrors.push(error.message)
      continue
    }
    inlineErrors.set(error.index, [...(inlineErrors.get(error.index) ?? []), `${label}: ${error.message}`])
  }

  // React resets a form once its action completes. A controlled <select> carries no `selected`
  // default to reset TO, so every Role and Mentor dropdown lands back on its first option while
  // React state still holds the real value: the screen then disagrees with what the next submit
  // will post, on exactly the screen a row error sends an admin back to. (The text inputs need
  // no help - React keeps their value attribute in step, so a reset restores what is on screen.)
  //
  // Written straight back to the DOM after the commit that reset it, rather than by re-keying
  // the selects: a remount would cost the admin their place in the form on every submit.
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    for (const select of formRef.current?.querySelectorAll('select[data-batch-field]') ?? []) {
      const field = select.getAttribute('data-batch-field')
      const row = rows.find((r) => r.id === select.getAttribute('data-batch-row'))
      if (row && (field === 'role' || field === 'mentor_id')) (select as HTMLSelectElement).value = row[field]
    }
  }, [state, rows])

  const outcome = state.outcome
  // `failed` is shown too when nothing at all was created: every row racing to a taken email
  // is rare, but reporting it as silence would be worse than rare.
  const showResults = outcome !== undefined && (outcome.created.length > 0 || outcome.failed.length > 0)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-soft">
        <UsersRound className="h-4 w-4" aria-hidden="true" />
        Add several
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add several people" size="lg">
        <p className="mb-3 text-sm text-slate-600">
          Up to {MAX_BATCH_ROWS} at a time. Every row is checked before anything is written, so one bad row costs
          nothing - and each account created gets a setup code shown here once.
        </p>

        {state.error && (
          <AlertBanner tone="warning" className="mb-3">
            {state.error}
          </AlertBanner>
        )}

        {/* Above the form on purpose: with twenty rows still on screen, codes rendered below
            them would be off-screen on the very submit that created them. */}
        {outcome && showResults && (
          <div className="mb-3">
            <BatchResults outcome={outcome} />
          </div>
        )}

        {rowErrors.length > 0 && (
          <AlertBanner tone="warning" className="mb-3">
            Nothing was created. Every row is still here - fix the ones marked below and submit again.
            {batchErrors.length > 0 && ` ${batchErrors.join(' ')}`}
          </AlertBanner>
        )}

        {!canAssignMentor && (
          <p className="mb-3 text-xs text-slate-600">
            Adding a student needs the mentor-assignment permission - a student is created with their mentor. Ask an
            admin to add the students, or to grant you that permission.
          </p>
        )}

        <form action={formAction} ref={formRef}>
          {/* One field, carrying the whole list - addUsersBatchAction reads `rows` and nothing
              else. Rendered from state on every render, so what is posted is what is on
              screen; a hand-synced copy would post the edit before last. */}
          <input type="hidden" name="rows" value={JSON.stringify(rows.map(postedRow))} />

          <ul className="space-y-3">
            {rows.map((row, index) => (
              <AddSeveralRow
                key={row.id}
                row={row}
                index={index}
                roles={roles}
                mentorCandidates={mentorCandidates}
                errors={inlineErrors.get(index) ?? []}
                canRemove={rows.length > 1}
                copyDownTargets={index === firstStudent ? studentsBelow : 0}
                onChange={(patch) => setRow(index, patch)}
                onRemove={() => removeRow(index)}
                onCopyDown={(field) => copyDown(index, field)}
              />
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={addRow} disabled={atCap} className="btn btn-sm btn-soft">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add row
            </button>
            <span className="text-xs text-slate-600">
              {atCap
                ? `That is the limit - ${MAX_BATCH_ROWS} people at a time. Submit these, then add the rest.`
                : `${rows.length} of ${MAX_BATCH_ROWS}.`}
            </span>
            {/* SubmitButton blocks a second submit while the first is in flight. It matters
                more here than anywhere: a double-click would create up to 25 more accounts. */}
            <SubmitButton className="btn-primary ml-auto" pendingLabel="Adding...">
              Add {rows.length} {rows.length === 1 ? 'person' : 'people'}
            </SubmitButton>
          </div>
        </form>

        {/* A datalist backs the country field: a search-and-pick dropdown that still accepts a
            free-typed country not on the list. */}
        <datalist id={COUNTRY_DATALIST_ID}>
          {COMMON_COUNTRIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Modal>
    </>
  )
}

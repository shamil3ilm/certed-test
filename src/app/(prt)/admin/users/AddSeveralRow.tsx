'use client'
import { Trash2 } from 'lucide-react'
import { cx, roleLabel } from '@/lib/ui'
import { Field, Input, Select } from '../../form'

export type MentorCandidate = { id: string; name: string }

/**
 * One row of the "Add several" editor, and the shape of a row.
 *
 * Extracted from AddSeveralButton because the two together ran past the file-size threshold in
 * docs/application-standards.md; the split is along the natural seam, with the batch owning the
 * list, the action and the results, and this file owning one person.
 *
 * Six fields and no more: the single Add-user form stays the place for phone, guardian and
 * joined-on, which a start-of-term intake does not have to hand anyway. See
 * docs/specs/2026-10-12-roles-relabel-and-bulk-user-add.md.
 *
 * `id` is a client key only - it is not posted. React would otherwise re-key every row below a
 * removal, handing a half-typed row the value of its neighbour.
 */
export type BatchRow = {
  id: string
  role: string
  email: string
  full_name: string
  country: string
  class_level: string
  mentor_id: string
}

/** The student-only fields, which are also the three a cohort shares. */
export type SharedField = 'country' | 'class_level' | 'mentor_id'

/** How the batch addresses a row's two selects, to write their values back after the form
 *  reset that follows an action. See the effect in AddSeveralButton. */
const selectAttrs = (row: BatchRow, field: 'role' | 'mentor_id') => ({
  'data-batch-row': row.id,
  'data-batch-field': field,
})

/** Its own id, not AddUserForm's `country-list`: both forms live on the People page, and two
 *  elements sharing one id is undefined behaviour. */
export const COUNTRY_DATALIST_ID = 'batch-country-list'

/** Error fields come back as the stored names; these are the words shown beside the row. */
export const FIELD_LABELS: Record<string, string> = {
  role: 'Role',
  email: 'Email',
  full_name: 'Name',
  country: 'Country',
  class_level: 'Class / grade',
  mentor_id: 'Mentor',
}

export const emptyRow = (id: string, role: string): BatchRow => ({
  id,
  role,
  email: '',
  full_name: '',
  country: '',
  class_level: '',
  mentor_id: '',
})

/**
 * What is POSTed for one row.
 *
 * Country, class and mentor are sent for a student row only. A row switched back to Tutor keeps
 * its typed values in state - so switching by mistake is undoable - but must not post them:
 * inviteUsersBatch pre-flights every mentor_id it is given, so a leftover one would attach a
 * mentor error to a row with no mentor field to fix it in.
 */
export const postedRow = (row: BatchRow) => {
  const identity = { role: row.role, email: row.email, full_name: row.full_name }
  return row.role === 'student'
    ? { ...identity, country: row.country, class_level: row.class_level, mentor_id: row.mentor_id }
    : identity
}

const COPY_DOWN_FIELDS: [SharedField, string][] = [
  ['country', 'Country'],
  ['class_level', 'Class / grade'],
  ['mentor_id', 'Mentor'],
]

export function AddSeveralRow({
  row,
  index,
  roles,
  mentorCandidates,
  errors,
  canRemove,
  copyDownTargets,
  onChange,
  onRemove,
  onCopyDown,
}: {
  row: BatchRow
  /** Zero-based; shown as "Person index + 1", which is also how an error names its row. */
  index: number
  roles: string[]
  mentorCandidates: MentorCandidate[]
  /** Already-worded messages for this row - empty when the row is fine. */
  errors: string[]
  canRemove: boolean
  /** How many student rows a copy-down from here would reach. 0 hides the control, so it
   *  never appears on a row that has nothing below it to fill. */
  copyDownTargets: number
  onChange: (patch: Partial<BatchRow>) => void
  onRemove: () => void
  onCopyDown: (field: SharedField) => void
}) {
  // A student is heavier than every other role because addUserSchema requires country and
  // class/grade for one, and validateAddUserInput requires a mentor. No other role has extras.
  const isStudent = row.role === 'student'

  return (
    <li
      className={cx(
        'rounded-xl border p-3',
        errors.length > 0 ? 'border-danger-border bg-danger-surface' : 'border-slate-200 bg-white',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">Person {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`Remove person ${index + 1}`}
          className="btn btn-sm btn-ghost"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Remove row
        </button>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Role">
          {/* roleLabel decides the words; the stored identifier stays in `value`. A label
              spelled here would drift - see tests/unit/role-labels-single-source.test.ts. */}
          <Select
            value={row.role}
            onChange={(event) => onChange({ role: event.target.value })}
            {...selectAttrs(row, 'role')}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={row.email}
            onChange={(event) => onChange({ email: event.target.value })}
            required
          />
        </Field>
        <Field label="Name">
          <Input value={row.full_name} onChange={(event) => onChange({ full_name: event.target.value })} />
        </Field>
      </div>

      {isStudent && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Country">
            <Input
              value={row.country}
              onChange={(event) => onChange({ country: event.target.value })}
              list={COUNTRY_DATALIST_ID}
              placeholder="Start typing…"
              autoComplete="off"
              required
            />
          </Field>
          <Field label="Class / grade">
            <Input
              value={row.class_level}
              onChange={(event) => onChange({ class_level: event.target.value })}
              placeholder="e.g. Grade 10"
              required
            />
          </Field>
          {mentorCandidates.length > 0 ? (
            <Field label="Mentor">
              {/* Required, matching the rule the service enforces: a student is created WITH
                  their mentor, never left for a follow-up that can be forgotten. */}
              <Select
                value={row.mentor_id}
                onChange={(event) => onChange({ mentor_id: event.target.value })}
                required
                {...selectAttrs(row, 'mentor_id')}
              >
                <option value="">Choose a mentor</option>
                {mentorCandidates.map((mentor) => (
                  <option key={mentor.id} value={mentor.id}>
                    {mentor.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            // Every student needs a mentor, so with none on the books the service would refuse
            // this account. Say so before the row is filled in.
            <p className="self-end text-xs text-slate-600">
              Add a tutor or mentor account first - every student is assigned a mentor.
            </p>
          )}
        </div>
      )}

      {isStudent && copyDownTargets > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>
            Copy down to the {copyDownTargets} student {copyDownTargets === 1 ? 'row' : 'rows'} below:
          </span>
          {COPY_DOWN_FIELDS.map(([field, label]) => (
            <button
              key={field}
              type="button"
              onClick={() => onCopyDown(field)}
              aria-label={`Copy ${label} down to the student rows below`}
              className="btn btn-sm btn-ghost"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs font-medium text-danger-ink">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

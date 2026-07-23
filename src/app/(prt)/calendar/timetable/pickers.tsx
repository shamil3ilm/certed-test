'use client'

import type { Opt } from './types'

/** The two option pickers shared by every form and row here. */

export function ClassSelect({
  classes,
  value,
  onChange,
  allowGlobal,
}: {
  classes: Opt[]
  value: string
  onChange: (value: string) => void
  allowGlobal?: boolean
}) {
  return (
    <label className="text-sm">
      Class
      <select
        className="mt-1 w-full rounded border p-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowGlobal && <option value="">Global (all)</option>}
        {!allowGlobal && classes.length === 0 && <option value="">No classes</option>}
        {classes.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name}
          </option>
        ))}
      </select>
    </label>
  )
}

export function TutorSelect({ tutors, value, onChange }: { tutors: Opt[]; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm">
      Tutor
      <select
        className="mt-1 w-full rounded border p-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Unassigned</option>
        {tutors.map((tutor) => (
          <option key={tutor.id} value={tutor.id}>
            {tutor.name}
          </option>
        ))}
      </select>
    </label>
  )
}

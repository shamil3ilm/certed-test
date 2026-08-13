'use client'

import { ACADEMY_WIDE_LABEL } from '@/lib/ui'
import { Select } from '../../form'
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
      <Select className="mt-1" value={value} onChange={(event) => onChange(event.target.value)}>
        {allowGlobal && <option value="">{ACADEMY_WIDE_LABEL}</option>}
        {!allowGlobal && classes.length === 0 && <option value="">No classes</option>}
        {classes.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name}
          </option>
        ))}
      </Select>
    </label>
  )
}

export function TutorSelect({
  tutors,
  value,
  onChange,
}: {
  tutors: Opt[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="text-sm">
      Tutor
      <Select className="mt-1" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Unassigned</option>
        {tutors.map((tutor) => (
          <option key={tutor.id} value={tutor.id}>
            {tutor.name}
          </option>
        ))}
      </Select>
    </label>
  )
}

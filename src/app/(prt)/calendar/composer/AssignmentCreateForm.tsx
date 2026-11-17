'use client'

import { useState, type FormEvent } from 'react'
import { Input, Select, Textarea } from '../../form'
import { api } from '../timetable/api'
import type { Opt } from '../calendar-types'
import { calendarDateInZone } from '../calendar-config'
import {
  CLASSWORK_TYPES,
  type ClassworkType,
  defaultExpectsSubmission,
  isTimedAssessment,
} from '../../assignments/classwork-types'

export function AssignmentCreateForm({
  date,
  classes,
  onSuccess,
  onError,
}: {
  date: string
  classes: Opt[]
  onSuccess: () => void
  onError: (message: string) => void
}) {
  const todayYmd = calendarDateInZone(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [dueDate, setDueDate] = useState(() => (date < todayYmd ? todayYmd : date))
  const [dueTime, setDueTime] = useState('17:00')
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [type, setType] = useState<ClassworkType>('exam')
  const [title, setTitle] = useState('')
  const [maxMarks, setMaxMarks] = useState('100')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isExamKind = isTimedAssessment(type)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    if (!classId) {
      const message = 'Please select a class.'
      setError(message)
      onError(message)
      setBusy(false)
      return
    }

    if (!title.trim()) {
      const message = 'Title is required.'
      setError(message)
      onError(message)
      setBusy(false)
      return
    }

    const marksNum = Number(maxMarks)
    if (Number.isNaN(marksNum) || marksNum <= 0 || marksNum > 9999.99) {
      const message = 'Max marks must be a positive number up to 9999.'
      setError(message)
      onError(message)
      setBusy(false)
      return
    }

    try {
      const dueInstant = new Date(`${dueDate}T${dueTime || '17:00'}:00`)
      if (Number.isNaN(dueInstant.getTime())) {
        throw new Error('Please select a valid date and time.')
      }

      await api('/api/assignments', 'POST', {
        class_id: classId,
        title: title.trim(),
        due_date: dueInstant.toISOString(),
        type,
        max_marks: marksNum,
        description: description.trim() || undefined,
        expects_submission: defaultExpectsSubmission(type),
      })
      onSuccess()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to schedule assignment'
      setError(message)
      onError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      {error && <p className="text-sm text-danger-ink sm:col-span-2">{error}</p>}

      <label className="text-sm sm:col-span-2">
        Type
        <Select value={type} onChange={(event) => setType(event.target.value as ClassworkType)} className="mt-1">
          {CLASSWORK_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </label>

      <label className="text-sm sm:col-span-2">
        Class
        <Select value={classId} onChange={(event) => setClassId(event.target.value)} required className="mt-1">
          {classes.length === 0 && <option value="">No classes available</option>}
          {classes.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </Select>
      </label>

      <label className="text-sm sm:col-span-2">
        Title
        <Input
          value={title}
          required
          onChange={(event) => setTitle(event.target.value)}
          placeholder={isExamKind ? 'e.g. Midterm Examination' : 'e.g. Chapter 4 Problem Set'}
          className="mt-1"
        />
      </label>

      <label className="text-sm">
        Due / Exam date
        <Input
          type="date"
          value={dueDate}
          min={todayYmd}
          required
          onChange={(event) => setDueDate(event.target.value)}
          className="mt-1"
        />
      </label>

      <label className="text-sm">
        Time
        <Input
          type="time"
          value={dueTime}
          required
          onChange={(event) => setDueTime(event.target.value)}
          className="mt-1"
        />
      </label>

      <label className="text-sm sm:col-span-2">
        Max marks
        <Input
          type="number"
          min={1}
          max={9999}
          step="any"
          value={maxMarks}
          required
          onChange={(event) => setMaxMarks(event.target.value)}
          className="mt-1"
        />
      </label>

      <label className="text-sm sm:col-span-2">
        Instructions / Description (optional)
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Details, covered chapters, or submission guidelines..."
          rows={3}
          className="mt-1"
        />
      </label>

      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="submit" disabled={busy || classes.length === 0} className="btn btn-primary">
          {busy ? 'Saving...' : isExamKind ? 'Schedule exam' : 'Save assignment'}
        </button>
      </div>
    </form>
  )
}

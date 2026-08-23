'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestJson } from '../api-client'
import { Field, Input, Select, Textarea } from '../form'
import { useUI } from '../Providers'
import { CARD, cx } from '@/lib/ui'
import { CLASSWORK_TYPES, defaultExpectsSubmission, isTimedAssessment, type ClassworkType } from './classwork-types'

type ClassRow = { id: string; name: string }

/** Attach the just-created assignment's PDF brief. Best-effort: the assignment is
 *  already created, so a failed upload must not lose it - we return an inline
 *  warning instead of throwing. PDF-only is re-validated server-side. */
async function uploadAssignmentPdf(assignmentId: string, file: File): Promise<string | null> {
  const form = new FormData()
  form.append('file', file)
  form.append('owner', 'assignment')
  form.append('ownerId', assignmentId)
  try {
    const res = await fetch('/api/attachments', { method: 'POST', body: form })
    const json = (await res.json().catch(() => null)) as { success: boolean; error?: string } | null
    if (!res.ok || !json?.success) {
      // The envelope message is already masked to something user-safe.
      return (json && json.error) || 'the PDF could not be attached'
    }
    return null
  } catch {
    return 'the PDF could not be attached'
  }
}

export function AssignmentForm({ classes }: { classes: ClassRow[] }) {
  const router = useRouter()
  const { toast } = useUI()
  const singleClass = classes.length === 1
  const [classId, setClassId] = useState(singleClass ? classes[0].id : '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [brief, setBrief] = useState('')
  const [topic, setTopic] = useState('')
  const [maxMarks, setMaxMarks] = useState('')
  const [due, setDue] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [type, setType] = useState<ClassworkType>('assignment')
  const [expectsSubmission, setExpectsSubmission] = useState(true)
  const [enforceDeadline, setEnforceDeadline] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    // Required fields are enforced natively (the submit event only fires once the
    // browser's constraint check passes); errors surface inline below, matching the
    // finance/submission forms rather than a toast.
    setError(null)
    setBusy(true)

    try {
      // Create first, then attach the PDF to the new assignment (a file needs an
      // owner id, so this is the create-then-attach flow the uploader also uses).
      const created = await requestJson<{ id: string }>('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId,
          title,
          description: description || undefined,
          due_date: new Date(due).toISOString(),
          ends_at: endsAt ? new Date(endsAt).toISOString() : undefined,
          attachment_drive_link: brief.trim() || undefined,
          topic: topic.trim() || undefined,
          max_marks: Number(maxMarks),
          type,
          expects_submission: expectsSubmission,
          enforce_deadline: expectsSubmission ? enforceDeadline : false,
        }),
      })

      const uploadWarning = file ? await uploadAssignmentPdf(created.id, file) : null
      const createdLabel = CLASSWORK_TYPES.find((t) => t.value === type)?.label ?? 'Assignment'

      setTitle('')
      setDescription('')
      setBrief('')
      setTopic('')
      setMaxMarks('')
      setDue('')
      setEndsAt('')
      setType('assignment')
      setExpectsSubmission(true)
      setEnforceDeadline(false)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      toast(
        uploadWarning ? `${createdLabel} created, but ${uploadWarning}.` : `${createdLabel} created`,
        uploadWarning ? 'error' : 'success',
      )
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create assignment')
    } finally {
      setBusy(false)
    }
  }

  const typeLabel = CLASSWORK_TYPES.find((t) => t.value === type)?.label ?? 'Assignment'
  const showEndTime = isTimedAssessment(type)

  return (
    <form onSubmit={onSubmit} className={cx(CARD, 'mt-4 space-y-3 p-4')}>
      <h2 className="font-medium text-slate-900">Create {typeLabel.toLowerCase()}</h2>
      <Field label="Type">
        <Select
          value={type}
          onChange={(event) => {
            const next = event.target.value as ClassworkType
            setType(next)
            setExpectsSubmission(defaultExpectsSubmission(next))
          }}
        >
          {CLASSWORK_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      {singleClass ? null : (
        <Field label="Class">
          <Select value={classId} onChange={(event) => setClassId(event.target.value)} required>
            <option value="" disabled>
              Select class
            </option>
            {classes.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Title">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Chapter 4 worksheet"
          required
        />
      </Field>
      <Field label="Description (optional)">
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
      </Field>
      <Field
        label="Brief link (optional)"
        hint="Link to a brief or resource - Google Drive, Docs, Loom, YouTube, etc. To attach a PDF, use the PDF uploader on the assignment after saving."
      >
        <Input type="url" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="https://..." />
      </Field>
      <Field
        label="Attach a PDF (optional)"
        hint="The assignment brief as a custodial PDF - streamed through the app, never shared publicly."
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          aria-label="Attach a PDF to this assignment"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="Topic (optional)" className="min-w-[10rem] flex-1" hint="e.g. Algebra - groups classwork">
          <Input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Unit / chapter" />
        </Field>
        <Field label="Max marks" className="w-32">
          <Input
            type="number"
            required
            min="1"
            step="0.5"
            value={maxMarks}
            onChange={(event) => setMaxMarks(event.target.value)}
            placeholder="e.g. 20"
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <Field label={showEndTime ? 'Starts' : 'Due'} className="min-w-[12rem] flex-1">
          <Input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} required />
        </Field>
        {showEndTime && (
          <Field
            label="Ends (optional)"
            className="min-w-[12rem] flex-1"
            hint="Sets a time window, e.g. a 2-hour exam."
          >
            <Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </Field>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={expectsSubmission}
          onChange={(event) => setExpectsSubmission(event.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Students submit their work online
      </label>
      {expectsSubmission && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={enforceDeadline}
            onChange={(event) => setEnforceDeadline(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Close submissions after the due date (block late work)
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary">
        {busy ? 'Creating...' : 'Create'}
      </button>
    </form>
  )
}

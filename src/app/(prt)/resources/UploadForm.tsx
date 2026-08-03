'use client'

import { useState, useTransition } from 'react'
import { checkDriveLink } from '@/lib/drive-link'
import { CARD, cx } from '@/lib/ui'
import { DOCUMENT_CATEGORIES, DOCUMENT_VISIBILITIES } from '@/lib/documents/categories'
import { Field, Input, Select, Textarea } from '../form'
import { assertActionOk } from '../action-client'
import { useUI } from '../Providers'
import { createDocumentAction } from './actions'

type ClassRow = { id: string; name: string }

const FILE_TYPES = ['PDF', 'Image', 'Document', 'Spreadsheet', 'Slides', 'Link', 'Other']

/** Upload a document to the class library: a Google Drive link plus metadata
 *  (category, subject, type, visibility). Managers only. */
export function UploadForm({ classes }: { classes: ClassRow[] }) {
  const { toast } = useUI()
  const [isPending, startTransition] = useTransition()
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0].value)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [fileType, setFileType] = useState('')
  const [visibility, setVisibility] = useState<string>('class')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const single = classes.length === 1
  const linkCheck = checkDriveLink(url)

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!classId || !title.trim() || !url.trim()) return

    const formData = new FormData()
    formData.append('classId', classId)
    formData.append('category', category)
    formData.append('title', title.trim())
    formData.append('subject', subject.trim())
    formData.append('file_type', fileType)
    formData.append('visibility', visibility)
    formData.append('description', description.trim())
    formData.append('url', url.trim())

    startTransition(async () => {
      try {
        assertActionOk(await createDocumentAction(formData), 'Something went wrong')
        setTitle('')
        setSubject('')
        setDescription('')
        setUrl('')
        toast('Document uploaded', 'success')
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Something went wrong')
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className={cx(CARD, 'space-y-4 p-5')}>
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-base font-semibold text-slate-900">Upload a document</h2>
        <p className="mt-0.5 text-xs text-slate-500">Paste a Google Drive share link and categorise it.</p>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        {!single && (
          <Field label="Class">
            <Select value={classId} onChange={(event) => setClassId(event.target.value)} required disabled={isPending}>
              {classes.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Category">
          <Select value={category} onChange={(event) => setCategory(event.target.value)} disabled={isPending}>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Term 1 Question Paper"
            required
            disabled={isPending}
          />
        </Field>
        <Field label="Subject (optional)">
          <Input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="e.g. Mathematics"
            disabled={isPending}
          />
        </Field>
        <Field label="File type (optional)">
          <Select value={fileType} onChange={(event) => setFileType(event.target.value)} disabled={isPending}>
            <option value="">Not specified</option>
            {FILE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Visibility">
          <Select value={visibility} onChange={(event) => setVisibility(event.target.value)} disabled={isPending}>
            {DOCUMENT_VISIBILITIES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description (optional)">
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="A short note about this document..."
          rows={2}
          disabled={isPending}
        />
      </Field>

      <div className="space-y-1">
        <label htmlFor="document-drive-link" className="text-xs font-medium text-slate-500">
          Google Drive link
        </label>
        <Input
          id="document-drive-link"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://drive.google.com/..."
          required
          disabled={isPending}
        />
        {linkCheck === 'folder' && (
          <p className="text-xs text-amber-600">
            That looks like a Drive <span className="font-medium">folder</span> link - link the specific file instead.
          </p>
        )}
        {linkCheck === 'not-drive' && (
          <p className="text-xs text-amber-600">
            Not a Drive link - fine for Docs/YouTube/a website. Make sure it opens for students who aren&apos;t signed
            in as you.
          </p>
        )}
        <p className="text-xs text-slate-400">
          Set sharing to <span className="font-medium text-slate-500">&quot;Anyone with the link&quot;</span> and test
          it in a private window. <span className="font-medium text-slate-500">Staff only</span> visibility hides it
          from students.
        </p>
      </div>

      <button type="submit" disabled={isPending} className="btn btn-primary">
        {isPending ? 'Uploading...' : 'Upload document'}
      </button>
    </form>
  )
}

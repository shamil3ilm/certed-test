'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { checkDriveLink } from '@/lib/drive-link'
import { CARD, cx } from '@/lib/ui'
import { DOCUMENT_CATEGORIES, DOCUMENT_VISIBILITIES } from '@/lib/documents/categories'
import { Field, Input, Select, Textarea } from '../form'
import { assertActionOk } from '../action-client'
import { useUI } from '../Providers'
import { createCustodialDocumentAction, createDocumentAction } from './actions'

type ClassRow = { id: string; name: string }

const FILE_TYPES = ['PDF', 'Image', 'Document', 'Spreadsheet', 'Slides', 'Link', 'Other']
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.zip'

/** Add a document to the class library: upload a file the academy KEEPS (custodial
 *  storage), or - as a fallback - paste a Google Drive link. Metadata (category,
 *  subject, type, visibility) applies either way. Managers only. */
export function UploadForm({ classes }: { classes: ClassRow[] }) {
  const { toast } = useUI()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0].value)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [fileType, setFileType] = useState('')
  const [visibility, setVisibility] = useState<string>('class')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const single = classes.length === 1
  const linkCheck = checkDriveLink(url)

  function metaForm(): FormData {
    const formData = new FormData()
    formData.append('classId', classId)
    formData.append('category', category)
    formData.append('title', title.trim())
    formData.append('subject', subject.trim())
    formData.append('file_type', fileType)
    formData.append('visibility', visibility)
    formData.append('description', description.trim())
    return formData
  }

  function reset() {
    setTitle('')
    setSubject('')
    setDescription('')
    setUrl('')
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!classId || !title.trim()) return
    if (!file && !url.trim()) {
      setError('Add a file to upload, or paste a Google Drive link.')
      return
    }

    startTransition(async () => {
      try {
        if (file) {
          // Custodial: create the document row, then upload its file to it.
          const created = await createCustodialDocumentAction(metaForm())
          if (!created.ok) throw new Error(created.error)
          const upload = new FormData()
          upload.append('file', file)
          upload.append('owner', 'resource')
          upload.append('ownerId', created.resourceId)
          const res = await fetch('/api/attachments', { method: 'POST', body: upload })
          const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null
          if (!res.ok || !json?.success) throw new Error(json?.error ?? 'Could not upload the file.')
        } else {
          const formData = metaForm()
          formData.append('url', url.trim())
          assertActionOk(await createDocumentAction(formData), 'Something went wrong')
        }
        toast('Document uploaded', 'success')
        reset()
        router.refresh()
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Something went wrong')
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className={cx(CARD, 'space-y-4 p-5')}>
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-base font-semibold text-slate-900">Upload a document</h2>
        <p className="mt-0.5 text-xs text-slate-600">Upload a file the academy keeps, and categorise it.</p>
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
        <label htmlFor="document-file" className="text-xs font-medium text-slate-600">
          File
        </label>
        <input
          id="document-file"
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          disabled={isPending}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20 disabled:opacity-50"
        />
        <p className="text-xs text-slate-600">
          Kept by the academy - PDF, Office documents, images or zip, up to 25 MB.{' '}
          <span className="font-medium text-slate-600">Staff only</span> visibility hides it from students.
        </p>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-slate-600">or link a Google Drive file instead</summary>
        <div className="mt-1.5 space-y-1">
          <Input
            id="document-drive-link"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://drive.google.com/..."
            disabled={isPending}
          />
          {linkCheck === 'folder' && (
            <p className="text-amber-600">
              That looks like a Drive <span className="font-medium">folder</span> link - link the specific file instead.
            </p>
          )}
          {linkCheck === 'not-drive' && (
            <p className="text-amber-600">
              Not a Drive link - fine for Docs/YouTube/a website. Make sure it opens for students who aren&apos;t signed
              in as you.
            </p>
          )}
          <p className="text-slate-600">
            A linked file is stored outside the academy - upload it above to keep a copy.
          </p>
        </div>
      </details>

      <button type="submit" disabled={isPending} className="btn btn-primary">
        {isPending ? 'Uploading...' : 'Upload document'}
      </button>
    </form>
  )
}

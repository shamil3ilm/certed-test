'use client'

import { useState, useTransition } from 'react'
import { assertActionOk } from '../action-client'
import { DOCUMENT_CATEGORIES, DOCUMENT_VISIBILITIES, type DocumentCategory } from '@/lib/documents/categories'
import { Field, Input, Select, Textarea } from '../form'
import { useUI } from '../Providers'
import { editDocumentAction } from './actions'

const FILE_TYPES = ['PDF', 'Image', 'Document', 'Spreadsheet', 'Slides', 'Link', 'Other']

type EditableDocument = {
  id: string
  title: string
  drive_link: string | null
  description: string | null
  category: DocumentCategory
  subject: string | null
  file_type: string | null
  visibility: 'class' | 'staff'
}

/** Inline editor for a document's metadata + link. Seeds from the CURRENT props
 *  on each open (the instance is keyed by id and survives a concurrent-edit
 *  revalidate) so opening never pre-fills stale values a save would revert. */
export function EditResource({ resource }: { resource: EditableDocument }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(resource.title)
  const [category, setCategory] = useState<string>(resource.category)
  const [subject, setSubject] = useState(resource.subject ?? '')
  const [fileType, setFileType] = useState(resource.file_type ?? '')
  const [visibility, setVisibility] = useState<string>(resource.visibility)
  const [description, setDescription] = useState(resource.description ?? '')
  const [url, setUrl] = useState(resource.drive_link ?? '')
  const [isPending, startTransition] = useTransition()
  const { toast } = useUI()

  function openEditor() {
    setTitle(resource.title)
    setCategory(resource.category)
    setSubject(resource.subject ?? '')
    setFileType(resource.file_type ?? '')
    setVisibility(resource.visibility)
    setDescription(resource.description ?? '')
    setUrl(resource.drive_link ?? '')
    setOpen(true)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || !url.trim()) return

    const formData = new FormData()
    formData.set('id', resource.id)
    formData.set('title', title.trim())
    formData.set('category', category)
    formData.set('subject', subject.trim())
    formData.set('file_type', fileType)
    formData.set('visibility', visibility)
    formData.set('description', description.trim())
    formData.set('url', url.trim())

    startTransition(async () => {
      try {
        assertActionOk(await editDocumentAction(formData), 'Could not save changes')
        setOpen(false)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not save changes', 'error')
      }
    })
  }

  if (!open) {
    return (
      <button type="button" onClick={openEditor} className="btn btn-sm btn-soft">
        Edit
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="mt-3 w-full space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Title">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(event) => setCategory(event.target.value)}>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subject">
          <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Mathematics" />
        </Field>
        <Field label="File type">
          <Select value={fileType} onChange={(event) => setFileType(event.target.value)}>
            <option value="">Not specified</option>
            {FILE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Visibility">
          <Select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
            {DOCUMENT_VISIBILITIES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Link">
          <Input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://drive.google.com/..."
            required
          />
        </Field>
      </div>
      <Field label="Description">
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
      </Field>
      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="btn btn-sm btn-primary">
          {isPending ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-sm btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  )
}

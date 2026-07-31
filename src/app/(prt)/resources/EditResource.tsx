'use client'

import { useState, useTransition } from 'react'
import { assertActionOk } from '../action-client'
import { Field, Input } from '../form'
import { useUI } from '../Providers'
import { editLinkResourceAction } from './actions'

export function EditResource({
  resource,
}: {
  resource: {
    id: string
    title: string
    drive_link: string | null
  }
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(resource.title)
  const [url, setUrl] = useState(resource.drive_link ?? '')
  const [isPending, startTransition] = useTransition()
  const { toast } = useUI()

  // Re-seed from the CURRENT props each open (this instance is keyed by
  // resource.id and survives the revalidate a concurrent edit triggers), so
  // opening never pre-fills stale values that a save would revert.
  function openEditor() {
    setTitle(resource.title)
    setUrl(resource.drive_link ?? '')
    setOpen(true)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || !url.trim()) return

    const formData = new FormData()
    formData.set('id', resource.id)
    formData.set('title', title.trim())
    formData.set('url', url.trim())

    startTransition(async () => {
      try {
        assertActionOk(await editLinkResourceAction(formData), 'Could not save changes')
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
      <Field label="Title">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
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

'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { cx } from '@/lib/ui'
import { Input } from '../form'
import { assertActionOk } from '../action-client'
import { useUI } from '../Providers'
import { tagToneClass } from './tone'
import { addTagAction, removeTagAction } from './actions'
import type { Tag, TaggableType } from '@/lib/services/tags'

/**
 * Add/remove tags on any entity. Free-text add (with existing tags offered as
 * suggestions), and a remove control per chip. Generic over entity type - the
 * server actions + service enforce who may tag what.
 */
export function TagEditor({
  type,
  entityId,
  tags,
  suggestions,
}: {
  type: TaggableType
  entityId: string
  tags: Tag[]
  suggestions: Tag[]
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const { toast } = useUI()

  async function submit(fields: Record<string, string>, failMessage: string) {
    setBusy(true)
    const formData = new FormData()
    formData.set('type', type)
    formData.set('entity_id', entityId)
    for (const [k, v] of Object.entries(fields)) formData.set(k, v)
    try {
      const isAdd = 'name' in fields
      assertActionOk(await (isAdd ? addTagAction : removeTagAction)(formData), failMessage)
      if (isAdd) setName('')
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : failMessage, 'error')
    } finally {
      setBusy(false)
    }
  }

  function onAdd(event: FormEvent) {
    event.preventDefault()
    const value = name.trim()
    if (value) void submit({ name: value }, 'Could not add tag')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length === 0 && <span className="text-xs text-slate-600">No tags yet.</span>}
        {tags.map((tag) => (
          <span
            key={tag.id}
            className={cx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-meta font-medium',
              tagToneClass(tag.color),
            )}
          >
            {tag.name}
            <button
              type="button"
              onClick={() => void submit({ tag_id: tag.id }, 'Could not remove tag')}
              disabled={busy}
              aria-label={`Remove tag ${tag.name}`}
              className="grid h-4 w-4 place-items-center rounded-full opacity-60 transition hover:bg-black/10 hover:opacity-100"
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={onAdd} className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            list="tag-suggestions"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add a tag..."
            aria-label="Add a tag"
            maxLength={40}
          />
        </div>
        <datalist id="tag-suggestions">
          {suggestions.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
        <button type="submit" disabled={busy || !name.trim()} className="btn btn-sm btn-soft">
          Add
        </button>
      </form>
    </div>
  )
}

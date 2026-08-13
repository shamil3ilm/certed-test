import { cx } from '@/lib/ui'
import type { Tag } from '@/lib/services/tags'
import { tagToneClass } from './tone'

/** Read-only tag chips for list rows and cards. Renders nothing when empty. */
export function TagChips({ tags, className }: { tags: Tag[]; className?: string }) {
  if (tags.length === 0) return null
  return (
    <div className={cx('flex flex-wrap gap-1', className)}>
      {tags.map((tag) => (
        <span key={tag.id} className={cx('rounded-full px-2 py-0.5 text-meta font-medium', tagToneClass(tag.color))}>
          {tag.name}
        </span>
      ))}
    </div>
  )
}

'use client'

import { useState } from 'react'
import type { Comment } from '@/lib/services/comments'
import type { MeetLink } from '@/lib/services/meet-links'
import { MeetCard, MeetingsEmptyState } from './meet-parts'

type Profile = { id: string; email: string; full_name: string | null; role: string }

export function MeetList({
  meetLinks,
  initialComments,
  me,
  classes,
  canManage,
  isAdmin,
}: {
  meetLinks: MeetLink[]
  initialComments: Map<string, Comment[]>
  me: Profile
  classes: { id: string; name: string }[]
  canManage: boolean
  isAdmin: boolean
}) {
  const [now] = useState(() => Date.now())
  const classMap = new Map(classes.map((course) => [course.id, course.name]))
  const currentClassId = classes[0]?.id ?? null

  return (
    <div className="space-y-4">
      {meetLinks.length === 0 ? (
        <MeetingsEmptyState />
      ) : (
        meetLinks.map((link) => (
          <MeetCard
            key={link.id}
            link={link}
            classLabel={classMap.get(link.class_id ?? '') ?? 'Academy-wide'}
            comments={initialComments.get(link.id) ?? []}
            me={me}
            canManage={canManage && (isAdmin || link.class_id === currentClassId)}
            now={now}
          />
        ))
      )}
    </div>
  )
}

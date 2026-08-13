'use client'

import type { Comment } from '@/lib/services/comments'
import type { MeetLink } from '@/lib/services/meet-links'
import { ACADEMY_WIDE_LABEL } from '@/lib/ui'
import { MeetCard, MeetingsEmptyState } from './meet-parts'

type Profile = { id: string; email: string; full_name: string | null; role: string }

export function MeetList({
  meetLinks,
  initialComments,
  me,
  classes,
  canManage,
  isAdmin,
  now,
}: {
  meetLinks: MeetLink[]
  initialComments: Map<string, Comment[]>
  me: Profile
  classes: { id: string; name: string }[]
  canManage: boolean
  isAdmin: boolean
  /** Server-computed clock (ms). Passed in - never Date.now() in a client initializer -
   *  so the grace-boundary "Ended"/"Starts" text is identical on the server and the
   *  first client render (no hydration mismatch). */
  now: number
}) {
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
            classLabel={classMap.get(link.class_id ?? '') ?? ACADEMY_WIDE_LABEL}
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

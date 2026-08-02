import type { Profile } from '@/lib/auth/profile'
import { loadClassworkPageData } from '@/lib/services/page-data/classwork'
import { AlertBanner, EmptyState, SectionLabel } from '@/lib/ui'
import { AssignmentForm } from '../../../assignments/AssignmentForm'
import { AssignmentCard } from './assignment-card'
import { MaterialsSection as MaterialsSectionContent } from './materials-section'

type ClassworkPageData = Awaited<ReturnType<typeof loadClassworkPageData>>

export function AssignmentsSection({ data, me, courseId }: { data: ClassworkPageData; me: Profile; courseId: string }) {
  return (
    <section id="assignments" className="scroll-mt-20 space-y-4">
      <SectionLabel>Assignments</SectionLabel>
      {data.isArchived && data.canManage && (
        <AlertBanner>
          This class is archived. Existing assignments and materials remain visible, but classwork changes are disabled
          until the class is restored.
        </AlertBanner>
      )}
      {data.canManageContent && <AssignmentForm classes={data.classList} />}

      <ul className="space-y-3">
        {data.assignmentViews.map((view) => (
          <AssignmentCard key={view.assignment.id} view={view} data={data} me={me} courseId={courseId} />
        ))}
        {data.assignmentViews.length === 0 && <EmptyState as="li">No assignments yet.</EmptyState>}
      </ul>
    </section>
  )
}

export function MaterialsSection({ data, me, courseId }: { data: ClassworkPageData; me: Profile; courseId: string }) {
  return <MaterialsSectionContent data={data} me={me} courseId={courseId} />
}

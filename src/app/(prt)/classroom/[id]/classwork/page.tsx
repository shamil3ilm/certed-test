import { requireClassAccess } from '../../access'
import { loadClassworkPageData } from '@/lib/services/page-data/classwork'
import { AlertBanner, SectionJumpNav } from '@/lib/ui'
import { AssignmentsSection, MaterialsSection } from './sections'

export default async function ClassworkPage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{
    q?: string
    cat?: string
    subj?: string
    from?: string
    to?: string
    sort?: string
    error?: string
  }>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  const { me, course } = await requireClassAccess(params.id)
  const data = await loadClassworkPageData(me, course, searchParams)

  return (
    <div className="space-y-8">
      {searchParams?.error === '1' && (
        <AlertBanner>That change couldn&apos;t be applied. Please refresh and try again.</AlertBanner>
      )}
      {/* In-tab jump nav: Classwork keeps Assignments + Materials together (the
          familiar grouping) but lets you hop straight to either section. */}
      {/* Center-aligned + wraps on small screens, so the pills line up with the
          report-card button and it flows below rather than squashing the row. */}
      <SectionJumpNav
        label="Classwork sections"
        items={[
          { href: '#assignments', label: 'Assignments' },
          { href: '#materials', label: 'Documents' },
        ]}
        trailing={
          data.isStudent ? (
            <a
              href={`/api/report-card/${me.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-soft ml-auto"
            >
              Download report card
            </a>
          ) : undefined
        }
      />
      <AssignmentsSection data={data} me={me} courseId={course.id} />
      <MaterialsSection data={data} me={me} courseId={course.id} />
    </div>
  )
}

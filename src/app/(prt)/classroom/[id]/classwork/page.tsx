import { requireClassAccess } from '../../access'
import { loadClassworkPageData } from '@/lib/services/page-data/classwork'
import { AlertBanner } from '@/lib/ui'
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
      <nav aria-label="Classwork sections" className="flex gap-2 border-b border-slate-100 pb-3 text-sm">
        <a
          href="#assignments"
          className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-600 transition hover:bg-primary/10 hover:text-primary"
        >
          Assignments
        </a>
        <a
          href="#materials"
          className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-600 transition hover:bg-primary/10 hover:text-primary"
        >
          Documents
        </a>
        {data.isStudent && (
          <a
            href={`/api/report-card/${me.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-soft ml-auto"
          >
            Download report card
          </a>
        )}
      </nav>
      <AssignmentsSection data={data} me={me} courseId={course.id} />
      <MaterialsSection data={data} me={me} courseId={course.id} />
    </div>
  )
}

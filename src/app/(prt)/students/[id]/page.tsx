import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { loadMenteeDetailPageData } from '@/lib/services/page-data/mentee-detail-page'
import { listMenteeNotes } from '@/lib/services/mentee-notes'
import { getProfileNamesByIds } from '@/lib/services/users'
import { clampPage, parsePageParam, totalPages } from '@/lib/pagination'
import { AlertBanner, BackLink } from '@/lib/ui'
import { EvaluationOverview, MenteeHeader } from './detail-parts'
import { EvaluationPanels, NeedsAttentionPanel, RecentSubmissionsPanel } from './detail-lists'
import { MenteeNotesPanel } from './MenteeNotesPanel'

const NOTES_PAGE_SIZE = 20

/** A mentee URL carrying the page's OTHER filters plus a notes page, so paging the notes
 *  never resets the evaluation period or class filter above them. */
function notePageHref(
  studentId: string,
  searchParams: { period?: string; classId?: string; sort?: string } | undefined,
  page: number,
): string {
  const sp = new URLSearchParams()
  if (searchParams?.period) sp.set('period', searchParams.period)
  if (searchParams?.classId) sp.set('classId', searchParams.classId)
  if (searchParams?.sort) sp.set('sort', searchParams.sort)
  if (page > 1) sp.set('notePage', String(page))
  const query = sp.toString()
  return query ? `/students/${studentId}?${query}#pastoral-notes` : `/students/${studentId}#pastoral-notes`
}

export default async function MenteePage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{
    period?: string
    classId?: string
    sort?: string
    error?: string
    notePage?: string
  }>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  const me = await requireCapability('viewMentees')
  const data = await loadMenteeDetailPageData(me, params.id, searchParams)
  if (!data) notFound()

  const { hasMentorAuthority } = await loadPersonaFlags(me.id)
  const { classes, submissions, overdue, evaluations } = data.overview

  // The pastoral record is paged. It used to be a flat newest-200 with no pager: a mentor
  // writing weekly reaches that in four years, after which the older notes simply stopped
  // existing as far as this page was concerned.
  const requestedNotePage = parsePageParam(searchParams?.notePage)
  const firstNotes = await listMenteeNotes(me, params.id, {
    page: requestedNotePage,
    pageSize: NOTES_PAGE_SIZE,
  })
  const notePage = clampPage(requestedNotePage, firstNotes.total, NOTES_PAGE_SIZE)
  const notes =
    notePage === requestedNotePage
      ? firstNotes
      : await listMenteeNotes(me, params.id, { page: notePage, pageSize: NOTES_PAGE_SIZE })
  const authorNames = await getProfileNamesByIds([
    ...new Set(notes.items.map((n) => n.author_id).filter((x): x is string => Boolean(x))),
  ])

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <BackLink href="/students">Back to mentees</BackLink>
      {searchParams?.error === '1' && (
        <AlertBanner tone="warning" className="mt-2">
          Couldn&apos;t add that note - please try again.
        </AlertBanner>
      )}
      <MenteeHeader data={data} hasMentorAuthority={hasMentorAuthority} />
      <EvaluationOverview
        studentId={params.id}
        classes={classes}
        evaluations={evaluations}
        searchParams={searchParams}
      />
      <NeedsAttentionPanel overdue={overdue} />
      <EvaluationPanels evaluations={evaluations} />
      <RecentSubmissionsPanel submissions={submissions} />
      <MenteeNotesPanel
        studentId={params.id}
        notes={notes.items}
        authorNames={authorNames}
        page={notePage}
        totalPages={totalPages(notes.total, NOTES_PAGE_SIZE)}
        total={notes.total}
        hrefFor={(p) => notePageHref(params.id, searchParams, p)}
      />
    </main>
  )
}

import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { loadMenteeDetailPageData } from '@/lib/services/page-data/mentee-detail-page'
import { listMenteeNotes } from '@/lib/services/mentee-notes'
import { getProfileNamesByIds } from '@/lib/services/users'
import { AlertBanner, BackLink } from '@/lib/ui'
import { EvaluationOverview, MenteeHeader } from './detail-parts'
import { EvaluationPanels, NeedsAttentionPanel, RecentSubmissionsPanel } from './detail-lists'
import { MenteeNotesPanel } from './MenteeNotesPanel'

export default async function MenteePage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ period?: string; classId?: string; sort?: string; error?: string }>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  const me = await requireCapability('viewMentees')
  const data = await loadMenteeDetailPageData(me, params.id, searchParams)
  if (!data) notFound()

  const { hasMentorAuthority } = await loadPersonaFlags(me.id)
  const { classes, submissions, overdue, evaluations } = data.overview

  const notes = await listMenteeNotes(me, params.id)
  const authorNames = await getProfileNamesByIds([
    ...new Set(notes.map((n) => n.author_id).filter((x): x is string => Boolean(x))),
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
      <MenteeNotesPanel studentId={params.id} notes={notes} authorNames={authorNames} />
    </main>
  )
}

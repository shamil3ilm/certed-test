import { requireCapability } from '@/lib/auth/require-role'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { getActorContext } from '@/lib/session/actor-context'
import { getReportCardData } from '@/lib/report-card/data'
import { StudentReportActions } from '@/lib/reports/student-report-actions'
import { PageHeader, EmptyState } from '@/lib/ui'
import { redirect } from 'next/navigation'
import { Gradecard } from './Gradecard'

/**
 * A student's own grade card: their marks across every class, filterable and
 * sortable on screen (the staff/mentor equivalent lives on /students/[id]).
 * Reads through getReportCardData, which allows a student to see their own.
 */
export default async function GradesPage() {
  const me = await requireCapability('viewClasses')
  const flags = await loadPersonaFlags(me.id)
  // Own grade card is student-only; a non-student is bounced through the shared
  // "no access" notice, matching requireCapability, not a silent redirect.
  if (!flags.isStudent) {
    redirect('/dashboard?denied=1')
  }
  const actor = await getActorContext()
  const data = await getReportCardData(actor, me.id)
  const marks = data?.marks ?? []

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="My grades"
        description="Your marks across all your classes - filter, search and sort. Download a report card any time."
        action={marks.length > 0 ? <StudentReportActions studentId={me.id} /> : undefined}
      />

      {marks.length === 0 ? (
        <EmptyState>Your grades will appear here once your tutors mark your work.</EmptyState>
      ) : (
        <Gradecard marks={marks} />
      )}
    </main>
  )
}

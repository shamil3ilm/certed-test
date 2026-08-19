import { Suspense } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { myClassIds } from '@/lib/services/classes'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import type { DashboardMentee } from '@/lib/services/page-data/dashboard'
import { MentorInsights } from './MentorInsights'
import { StudentAnalyticsStats, TutorAnalyticsStats } from './analytics-stats'
import { DashboardChartsSection } from './charts-section'
import { CapabilityNotice, MenteesPanel } from './dashboard-panels'
import { DashboardScopeHeader, DashboardSection, DashboardWidgetGrid } from './dashboard-layout'
import {
  DueWorkWidget,
  LatestAnnouncementWidget,
  GradeTrajectoryWidget,
  PendingAttendanceWidget,
  RecentUploadsWidget,
  RemindersWidget,
  SubmissionsToReviewWidget,
  UpcomingClassesWidget,
  UpcomingExamsWidget,
  WidgetSkeleton,
} from './widgets'

function createDashboardClassDataPromises(me: Profile) {
  const classIdsPromise = myClassIds(me)
  const sharedDataPromise = Promise.all([classIdsPromise, getInstituteTimeZone()])
  return { classIdsPromise, sharedDataPromise }
}

export function MentorDashboardContent({
  me,
  mentees,
  teaches,
  now,
  canViewMentees,
  canViewClasses,
  canViewGrading,
}: {
  me: Profile
  mentees: DashboardMentee[]
  teaches: boolean
  now: number
  canViewMentees: boolean
  canViewClasses: boolean
  canViewGrading: boolean
}) {
  // A mentor who also teaches stacks two DISTINCT scopes - pastoral (their mentees,
  // across every class) and teaching (their own classes) - which is otherwise the
  // longest dashboard and reads as repetition (two attendance figures, two work
  // lists). Label each scope, and drop the teaching charts in this combined view so
  // the page stays manageable; the mentee/class stats and lists still differ.
  const isCombined = canViewMentees && teaches
  return (
    <>
      {canViewMentees && (
        <>
          {isCombined && <DashboardScopeHeader>Your mentees</DashboardScopeHeader>}
          <MenteesPanel mentees={mentees} />
          <Suspense fallback={<WidgetSkeleton />}>
            <MentorInsights me={me} />
          </Suspense>
        </>
      )}
      {teaches ? (
        <>
          {isCombined && <DashboardScopeHeader>Your classes</DashboardScopeHeader>}
          <TutorDashboardContent
            me={me}
            now={now}
            canViewClasses={canViewClasses}
            canViewGrading={canViewGrading}
            showCharts={!isCombined}
          />
        </>
      ) : (
        <>
          {canViewClasses && (
            <DashboardWidgetGrid>
              <Suspense fallback={<WidgetSkeleton />}>
                <ClassUpcomingClasses me={me} now={now} />
              </Suspense>
            </DashboardWidgetGrid>
          )}
          <DashboardSection>
            <Suspense fallback={<WidgetSkeleton />}>
              <RemindersWidget me={me} now={now} />
            </Suspense>
          </DashboardSection>
        </>
      )}
    </>
  )
}

export function TutorDashboardContent({
  me,
  now,
  canViewClasses,
  canViewGrading,
  showSummary = true,
  showCharts = true,
  includeRecentUploads = true,
}: {
  me: Profile
  now: number
  canViewClasses: boolean
  canViewGrading: boolean
  showSummary?: boolean
  showCharts?: boolean
  includeRecentUploads?: boolean
}) {
  if (!canViewClasses && !canViewGrading) {
    return (
      <DashboardSection>
        <CapabilityNotice message="Class and grading widgets are hidden because this account does not currently have those features enabled." />
        <DashboardSection>
          <Suspense fallback={<WidgetSkeleton />}>
            <RemindersWidget me={me} now={now} />
          </Suspense>
        </DashboardSection>
      </DashboardSection>
    )
  }

  const { sharedDataPromise } = createDashboardClassDataPromises(me)

  return (
    <>
      {canViewClasses && showSummary && (
        <DashboardSection>
          <Suspense fallback={<WidgetSkeleton />}>
            <TutorAnalyticsStats me={me} />
          </Suspense>
        </DashboardSection>
      )}
      <DashboardWidgetGrid>
        {canViewClasses && (
          <Suspense fallback={<WidgetSkeleton />}>
            <ClassUpcomingClasses me={me} now={now} sharedDataPromise={sharedDataPromise} />
          </Suspense>
        )}
        {canViewClasses && (
          <Suspense fallback={<WidgetSkeleton />}>
            <UpcomingExamsWidget />
          </Suspense>
        )}
        {canViewClasses && (
          <Suspense fallback={<WidgetSkeleton />}>
            <TutorPendingAttendance me={me} sharedDataPromise={sharedDataPromise} />
          </Suspense>
        )}
        {canViewGrading && (
          <Suspense fallback={<WidgetSkeleton />}>
            <TutorSubmissionsToReview me={me} sharedDataPromise={sharedDataPromise} />
          </Suspense>
        )}
        {canViewClasses && includeRecentUploads && (
          <Suspense fallback={<WidgetSkeleton />}>
            <TutorRecentUploads me={me} sharedDataPromise={sharedDataPromise} />
          </Suspense>
        )}
      </DashboardWidgetGrid>
      {canViewClasses && showCharts && <DashboardChartsSection me={me} />}
      <DashboardSection>
        <Suspense fallback={<WidgetSkeleton />}>
          <RemindersWidget me={me} now={now} />
        </Suspense>
      </DashboardSection>
    </>
  )
}

export function StudentDashboardContent({
  me,
  now,
  canViewClasses,
}: {
  me: Profile
  now: number
  canViewClasses: boolean
}) {
  if (!canViewClasses) {
    return (
      <DashboardSection>
        <CapabilityNotice message="Class widgets are hidden because this account does not currently have class access enabled." />
        <DashboardSection>
          <Suspense fallback={<WidgetSkeleton />}>
            <RemindersWidget me={me} now={now} />
          </Suspense>
        </DashboardSection>
      </DashboardSection>
    )
  }

  const { classIdsPromise } = createDashboardClassDataPromises(me)

  return (
    <>
      <DashboardSection>
        <Suspense fallback={<WidgetSkeleton />}>
          <StudentAnalyticsStats me={me} />
        </Suspense>
      </DashboardSection>
      <DashboardWidgetGrid>
        <Suspense fallback={<WidgetSkeleton />}>
          <ClassUpcomingClasses me={me} now={now} classIdsPromise={classIdsPromise} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <UpcomingExamsWidget />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <StudentDueWork me={me} now={now} classIdsPromise={classIdsPromise} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <GradeTrajectoryWidget studentId={me.id} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <StudentLatestAnnouncement me={me} classIdsPromise={classIdsPromise} />
        </Suspense>
      </DashboardWidgetGrid>
      <DashboardChartsSection me={me} />
      <DashboardSection>
        <Suspense fallback={<WidgetSkeleton />}>
          <RemindersWidget me={me} now={now} />
        </Suspense>
      </DashboardSection>
    </>
  )
}

export function GenericDashboardContent({ me, now }: { me: Profile; now: number }) {
  return (
    <>
      <DashboardSection>
        <CapabilityNotice message="This account is active, but it does not yet have a persona-specific dashboard. Personal reminders remain available while feature access is being configured." />
      </DashboardSection>
      <DashboardSection>
        <Suspense fallback={<WidgetSkeleton />}>
          <RemindersWidget me={me} now={now} />
        </Suspense>
      </DashboardSection>
    </>
  )
}

async function ClassUpcomingClasses({
  me,
  now,
  title = 'Upcoming classes',
  classIdsPromise,
  sharedDataPromise,
}: {
  me: Profile
  now: number
  title?: string
  classIdsPromise?: Promise<string[]>
  sharedDataPromise?: Promise<[string[], string]>
}) {
  const [classIds, timeZone] = await (sharedDataPromise ??
    Promise.all([classIdsPromise ?? myClassIds(me), getInstituteTimeZone()]))
  return <UpcomingClassesWidget me={me} now={now} title={title} data={{ classIds, timeZone }} />
}

async function TutorPendingAttendance({
  me,
  sharedDataPromise,
}: {
  me: Profile
  sharedDataPromise: Promise<[string[], string]>
}) {
  const [classIds, timeZone] = await sharedDataPromise
  return <PendingAttendanceWidget me={me} data={{ classIds, timeZone }} />
}

async function TutorRecentUploads({
  me,
  sharedDataPromise,
}: {
  me: Profile
  sharedDataPromise: Promise<[string[], string]>
}) {
  const [classIds] = await sharedDataPromise
  return <RecentUploadsWidget me={me} data={{ classIds }} />
}

async function TutorSubmissionsToReview({
  me,
  sharedDataPromise,
}: {
  me: Profile
  sharedDataPromise: Promise<[string[], string]>
}) {
  const [classIds] = await sharedDataPromise
  return <SubmissionsToReviewWidget me={me} data={{ classIds }} />
}

async function StudentDueWork({
  me,
  now,
  classIdsPromise,
}: {
  me: Profile
  now: number
  classIdsPromise: Promise<string[]>
}) {
  const classIds = await classIdsPromise
  return <DueWorkWidget me={me} now={now} data={{ classIds }} />
}

async function StudentLatestAnnouncement({ me, classIdsPromise }: { me: Profile; classIdsPromise: Promise<string[]> }) {
  const classIds = await classIdsPromise
  return <LatestAnnouncementWidget me={me} data={{ classIds }} />
}

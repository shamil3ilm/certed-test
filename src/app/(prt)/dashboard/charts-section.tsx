import { Suspense } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { loadDashboardChartSeries } from '@/lib/services/page-data/dashboard-charts'
import { DashboardCharts } from './DashboardCharts'
import { DashboardSection } from './dashboard-layout'
import { WidgetSkeleton } from './widgets'

async function ChartsInner({ me }: { me: Profile }) {
  const series = await loadDashboardChartSeries(me)
  if (series.length === 0) return null
  return <DashboardCharts series={series} title="Insights" />
}

/** Streams in the dynamic chart panel so it never blocks the stat cards above. */
export function DashboardChartsSection({ me }: { me: Profile }) {
  return (
    <DashboardSection>
      <Suspense fallback={<WidgetSkeleton />}>
        <ChartsInner me={me} />
      </Suspense>
    </DashboardSection>
  )
}

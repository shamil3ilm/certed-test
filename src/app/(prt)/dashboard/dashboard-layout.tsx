import type { ReactNode } from 'react'
import { cx } from '@/lib/ui'

/** Shared vertical section spacing for dashboard blocks across all personas. */
export function DashboardSection({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={cx('mt-6', className)}>{children}</section>
}

/** Shared widget grid rhythm for dashboard card rows. */
export function DashboardWidgetGrid({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <DashboardSection className={cx('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {children}
    </DashboardSection>
  )
}

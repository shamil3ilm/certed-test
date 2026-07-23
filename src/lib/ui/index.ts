/**
 * The portal design system. Import shared primitives from `@/lib/ui` - never from
 * a route folder (see docs/architecture-rules.md section 7).
 *
 * Modules:
 *  - core      class-name helper + surface token
 *  - identity  initials, role tone, Avatar, class banner
 *  - labels    role/persona display labels, Badge, SectionLabel
 *  - layout    Card, EmptyState, PageHeader, Panel, StatGrid, StatCard
 *  - list      ListRow, RowChevron
 *  - forms     FilterBar, FilterField, FILTER_CONTROL
 *  - charts    LegendDot, MiniBars, Donut
 *
 * These are presentation only: no domain, data or Supabase imports.
 */
export { cx, CARD } from './core'
export { initials, roleTone, classBanner, Avatar } from './identity'
export { roleLabel, personaLabel, Badge, SectionLabel } from './labels'
export { Card, EmptyState, PageHeader, Panel, StatGrid, StatCard } from './layout'
export { ListRow, RowChevron } from './list'
export { FILTER_CONTROL, FilterField, FilterBar } from './forms'
export { LegendDot, MiniBars, Donut } from './charts'

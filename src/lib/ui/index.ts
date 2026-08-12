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
 *  - forms     FilterBar, FilterField, SearchFilterField, FILTER_CONTROL, FILTER_SEARCH_FIELD
 *  - charts    LegendDot, MiniBars, Donut
 *
 * These are presentation only: no domain, data or Supabase imports.
 */
export { cx, CARD, ARCHIVED_ROW } from './core'
export { initials, roleTone, classBanner, Avatar } from './identity'
export {
  roleLabel,
  statusLabel,
  mentoringSectionLabel,
  staffRoleLabel,
  personaLabel,
  Badge,
  SectionLabel,
} from './labels'
export { AlertBanner, BackLink, Card, EmptyState, PageHeader, Panel, StatGrid, StatCard, PaginationBar } from './layout'
export { ListRow, RowChevron } from './list'
export { ArchivedList } from './archived-list'
export { ExternalActionLink } from './external-action-link'
export { SECTION_JUMP_LINK, SectionJumpNav } from './section-jump-nav'
export {
  FILTER_CONTROL,
  FILTER_SEARCH_FIELD,
  FilterField,
  SearchFilterField,
  SelectFilterField,
  DateFilterField,
  FilterBar,
} from './forms'
export { pillButtonClass, segmentedButtonClass, SEGMENTED_GROUP } from './toggles'
export { LegendDot, MiniBars, ColumnChart, LineChart, type ChartPoint } from './charts'
export { createClientId } from './client-id'

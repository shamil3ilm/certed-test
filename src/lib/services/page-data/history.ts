import type { Profile } from '@/lib/auth/profile'
import { isAdminTier } from '@/lib/capabilities'
import { listAuditPage } from '@/lib/data/audit'
import { clampPage, parsePageParam, totalPages } from '@/lib/pagination'
import { getProfilesByIds, searchProfileIds } from '@/lib/services/users'

const PAGE_SIZE = 25
const NO_MATCH_ACTOR_ID = '00000000-0000-0000-0000-000000000000'
// viewHistory is override-grantable to a non-admin (sub_admin/tutor/mentor). Such a
// viewer must not learn admin identities: the actor search is clamped to these roles,
// and any admin-tier actor in a row is shown by tier, never by name/email.
const NON_ADMIN_ROLES = ['student', 'tutor', 'mentor'] as const
const ADMIN_TIER_ROLES = new Set(['admin', 'sub_admin'])

const VERB_TONE: Record<string, string> = {
  add: 'text-success-ink',
  create: 'text-success-ink',
  restore: 'text-success-ink',
  assign: 'text-success-ink',
  issue: 'text-success-ink',
  update: 'text-slate-700',
  edit: 'text-slate-700',
  grade: 'text-slate-700',
  password: 'text-slate-700',
  mark: 'text-slate-700',
  revoke: 'text-danger-ink',
  delete: 'text-danger-ink',
  archive: 'text-danger-ink',
  remove: 'text-danger-ink',
  void: 'text-danger-ink',
}

type HistoryFilters = {
  page: number
  action?: string
  actor?: string
}

type HistoryViewRow = {
  id: string
  created_at: string
  actorLabel: string | null
  actionScope: string
  actionVerb: string
  actionVerbTone: string
  entity_type: string
  entity_id: string | null
  entityShortId: string | null
}

type HistoryPageData = {
  filters: HistoryFilters
  /** Whether the reader has narrowed the log. An empty RESULT and an empty LOG are
   *  different states, and on an audit trail saying the second when the first is true
   *  reads as records having been lost. */
  hasActiveFilters: boolean
  rows: HistoryViewRow[]
  total: number
  totalPages: number
}

function actionParts(action: string): { scope: string; verb: string } {
  const i = action.indexOf('.')
  return i === -1 ? { scope: '', verb: action } : { scope: action.slice(0, i), verb: action.slice(i + 1) }
}

export function historyUrl(params: HistoryFilters): string {
  const sp = new URLSearchParams()
  if (params.page > 1) sp.set('page', String(params.page))
  if (params.action) sp.set('action', params.action)
  if (params.actor) sp.set('actor', params.actor)
  return `/admin/history?${sp.toString()}`
}

async function resolveActorIds(
  actor: string | undefined,
  visibleRoles: readonly string[] | undefined,
): Promise<string[] | undefined> {
  if (!actor) return undefined
  const actorIds = await searchProfileIds(actor, visibleRoles)
  return actorIds.length > 0 ? actorIds : [NO_MATCH_ACTOR_ID]
}

export async function loadHistoryPageData(
  viewer: Profile,
  searchParams: {
    page?: string
    action?: string
    actor?: string
  },
): Promise<HistoryPageData> {
  const isSuper = isAdminTier(viewer)
  const filters: HistoryFilters = {
    page: parsePageParam(searchParams.page),
    action: searchParams.action?.trim() || undefined,
    actor: searchParams.actor?.trim() || undefined,
  }

  // A non-super viewer's actor search may only match non-admin roles (no admin oracle).
  const actorIds = await resolveActorIds(filters.actor, isSuper ? undefined : NON_ADMIN_ROLES)
  const requestedPage = filters.page
  const read = (page: number) => listAuditPage({ page, pageSize: PAGE_SIZE, action: filters.action, actorIds })
  const first = await read(requestedPage)
  // Fold a page past the end back onto the last real one. parsePageParam can only clamp
  // the LOWER bound - it has no idea how many rows exist - so a stale bookmark or a
  // narrowed filter otherwise leaves a blank list with no way back but editing the URL.
  const currentPage = clampPage(filters.page, first.total, PAGE_SIZE)
  filters.page = currentPage
  const { items, total } = currentPage === requestedPage ? first : await read(currentPage)
  const actors = await getProfilesByIds(items.map((r) => r.actor_id).filter((id): id is string => !!id))
  const rows = items.map((r) => {
    const actor = r.actor_id ? actors.get(r.actor_id) : null
    // Actor identity, tiered by viewer. A non-super viewer (viewHistory can be
    // override-granted to a sub_admin/tutor/mentor) never sees an admin-tier actor's
    // identity (show the tier) and never sees ANYONE's raw email: the name if
    // set, else a short id - never PII. A super viewer (full admin) sees the full
    // identity, email fallback included.
    let actorLabel: string | null = null
    if (actor) {
      if (!isSuper && ADMIN_TIER_ROLES.has(actor.role)) actorLabel = 'Administrator'
      else if (isSuper) actorLabel = actor.full_name ?? actor.email
      else actorLabel = actor.full_name ?? `User ${(r.actor_id ?? '').slice(0, 8)}`
    }
    const { scope, verb } = actionParts(r.action)
    return {
      id: r.id,
      created_at: r.created_at,
      actorLabel,
      actionScope: scope,
      actionVerb: verb,
      actionVerbTone: VERB_TONE[verb] ?? 'text-slate-700',
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      entityShortId: r.entity_id ? r.entity_id.slice(0, 8) : null,
    }
  })

  return {
    filters,
    hasActiveFilters: Boolean(filters.action || filters.actor),
    rows,
    total,
    totalPages: totalPages(total, PAGE_SIZE),
  }
}

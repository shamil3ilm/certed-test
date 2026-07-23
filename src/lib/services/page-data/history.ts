import { listAuditPage } from '@/lib/data/audit'
import { getProfilesByIds, listProfiles } from '@/lib/services/users'

const PAGE_SIZE = 25
const NO_MATCH_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

const VERB_TONE: Record<string, string> = {
  add: 'text-emerald-700',
  create: 'text-emerald-700',
  restore: 'text-emerald-700',
  assign: 'text-emerald-700',
  issue: 'text-emerald-700',
  update: 'text-slate-700',
  edit: 'text-slate-700',
  grade: 'text-slate-700',
  password: 'text-slate-700',
  mark: 'text-slate-700',
  revoke: 'text-red-700',
  delete: 'text-red-700',
  archive: 'text-red-700',
  remove: 'text-red-700',
  void: 'text-red-700',
}

export type HistoryFilters = {
  page: number
  action?: string
  actor?: string
}

export type HistoryViewRow = {
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

export type HistoryPageData = {
  filters: HistoryFilters
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

async function resolveActorIds(actor?: string): Promise<string[] | undefined> {
  if (!actor) return undefined
  const needle = actor.toLowerCase()
  const profiles = await listProfiles()
  const actorIds = profiles
    .filter((p) => (p.full_name ?? '').toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle))
    .map((p) => p.id)
  return actorIds.length > 0 ? actorIds : [NO_MATCH_ACTOR_ID]
}

export async function loadHistoryPageData(searchParams: {
  page?: string
  action?: string
  actor?: string
}): Promise<HistoryPageData> {
  const filters: HistoryFilters = {
    page: Math.max(1, Number(searchParams.page) || 1),
    action: searchParams.action?.trim() || undefined,
    actor: searchParams.actor?.trim() || undefined,
  }

  const actorIds = await resolveActorIds(filters.actor)
  const { items, total } = await listAuditPage({
    page: filters.page,
    pageSize: PAGE_SIZE,
    action: filters.action,
    actorIds,
  })
  const actors = await getProfilesByIds(items.map((r) => r.actor_id).filter((id): id is string => !!id))
  const rows = items.map((r) => {
    const actor = r.actor_id ? actors.get(r.actor_id) : null
    const { scope, verb } = actionParts(r.action)
    return {
      id: r.id,
      created_at: r.created_at,
      actorLabel: actor ? (actor.full_name ?? actor.email) : null,
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
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

'use client'

import { useMemo, useState, useTransition } from 'react'
import { Badge, SectionLabel, SEGMENTED_GROUP, segmentedButtonClass } from '@/lib/ui'
import type { PermissionRow } from '@/lib/services/page-data/user-permissions'
import { assertActionOk } from '../../../../action-client'
import { useUI } from '../../../../Providers'
import { Input } from '../../../../form'
import { setUserCapabilityAction } from './actions'

type Effect = 'default' | 'allow' | 'deny'

export function PermissionsEditor({ profileId, rows }: { profileId: string; rows: PermissionRow[] }) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, PermissionRow[]>()
    for (const row of rows) {
      const list = byGroup.get(row.group) ?? []
      list.push(row)
      byGroup.set(row.group, list)
    }
    return [...byGroup.entries()]
  }, [rows])

  return (
    <div className="space-y-6">
      {groups.map(([group, groupRows]) => (
        <section key={group}>
          <SectionLabel>{group}</SectionLabel>
          <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {groupRows.map((row) => (
              <PermissionRowItem key={row.capability} profileId={profileId} row={row} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function effectiveFor(effect: Effect, baselineAllowed: boolean): boolean {
  return effect === 'allow' ? true : effect === 'deny' ? false : baselineAllowed
}

function PermissionRowItem({ profileId, row }: { profileId: string; row: PermissionRow }) {
  const { toast } = useUI()
  const [effect, setEffect] = useState<Effect>(row.effect)
  const [pending, startTransition] = useTransition()
  // Reason capture for sensitive capabilities: holds the effect awaiting a reason.
  const [reasonFor, setReasonFor] = useState<Effect | null>(null)
  const [reason, setReason] = useState('')

  const effective = effectiveFor(effect, row.baselineAllowed)

  function apply(next: Effect, withReason?: string) {
    const previous = effect
    setEffect(next) // optimistic
    setReasonFor(null)
    setReason('')
    startTransition(async () => {
      try {
        assertActionOk(
          await setUserCapabilityAction({
            profileId,
            capability: row.capability,
            effect: next,
            reason: withReason ?? null,
          }),
          'Could not update this permission',
        )
      } catch (error) {
        setEffect(previous) // revert on failure
        toast(error instanceof Error ? error.message : 'Could not update this permission', 'error')
      }
    })
  }

  function choose(next: Effect) {
    if (row.isHard || row.isOverrideBlocked || pending || next === effect) return
    if (row.reasonRequired && next !== 'default') {
      setReasonFor(next) // ask for a reason first
      setReason('')
      return
    }
    apply(next)
  }

  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-800">{row.label}</span>
          <SourceBadge effect={effect} baselineAllowed={row.baselineAllowed} isHard={row.isHard} />
          <AccessDot effective={row.isHard ? row.effective : effective} />
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{row.description}</p>
      </div>

      {row.isHard || row.isOverrideBlocked ? (
        <Badge tone="slate" className="shrink-0">
          {row.isHard ? 'Locked - platform rule' : 'Locked - scoped access only'}
        </Badge>
      ) : (
        <div className="shrink-0">
          <Segmented value={effect} disabled={pending} baselineAllowed={row.baselineAllowed} onChange={choose} />
        </div>
      )}

      {reasonFor && (
        <div className="w-full sm:mt-2 sm:basis-full">
          <label className="block text-xs font-medium text-slate-500">
            Reason for {reasonFor === 'allow' ? 'granting' : 'revoking'} &quot;{row.label}&quot; (required, audited)
            <Input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1"
              placeholder="e.g. Covering finance while the bursar is on leave"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={!reason.trim() || pending}
              onClick={() => apply(reasonFor, reason.trim())}
              className="btn btn-sm btn-primary"
            >
              Confirm
            </button>
            <button type="button" onClick={() => setReasonFor(null)} className="btn btn-sm btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function Segmented({
  value,
  disabled,
  baselineAllowed,
  onChange,
}: {
  value: Effect
  disabled: boolean
  baselineAllowed: boolean
  onChange: (next: Effect) => void
}) {
  const options: { key: Effect; label: string; tone: 'slate' | 'success' | 'danger' }[] = [
    { key: 'default', label: `Default (${baselineAllowed ? 'on' : 'off'})`, tone: 'slate' },
    { key: 'allow', label: 'Allow', tone: 'success' },
    { key: 'deny', label: 'Deny', tone: 'danger' },
  ]
  return (
    <div className={SEGMENTED_GROUP} role="group" aria-label="Permission">
      {options.map((o) => {
        const active = value === o.key
        return (
          <button
            key={o.key}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(o.key)}
            className={segmentedButtonClass(active, o.tone)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function SourceBadge({
  effect,
  baselineAllowed,
  isHard,
}: {
  effect: Effect
  baselineAllowed: boolean
  isHard: boolean
}) {
  if (isHard) return null
  if (effect === 'allow') return <Badge tone="success">Granted - override</Badge>
  if (effect === 'deny') return <Badge tone="danger">Revoked - override</Badge>
  return <Badge tone="slate">{baselineAllowed ? 'Persona default' : 'Not in default'}</Badge>
}

function AccessDot({ effective }: { effective: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-meta font-medium text-slate-400">
      <span className={`h-1.5 w-1.5 rounded-full ${effective ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      {effective ? 'has access' : 'no access'}
    </span>
  )
}

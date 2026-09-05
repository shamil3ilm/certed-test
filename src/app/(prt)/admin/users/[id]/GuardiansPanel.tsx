'use client'
import { Card, EmptyState } from '@/lib/ui'
import { Field, Input, SubmitButton } from '../../../form'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import type { GuardianRow } from '@/lib/services/guardians'
import { addGuardianAction, makeGuardianPrimaryAction, removeGuardianAction } from './guardian-actions'

/**
 * Manage a student's parent/guardian contacts (both parents when applicable) - add,
 * remove, or mark one primary. Each guardian carries a name plus optional phone, email
 * and relationship. Admin/sub-admin only; the page already gates access. Editing a
 * contact = remove + re-add for now.
 */
export function GuardiansPanel({ studentId, guardians }: { studentId: string; guardians: GuardianRow[] }) {
  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold text-slate-900">Parents &amp; guardians</h2>
      <p className="mt-0.5 text-xs text-slate-600">
        Used to contact the guardian and to record consent for a student. Add both parents where relevant.
      </p>

      {guardians.length === 0 ? (
        <EmptyState className="mt-3">No guardians yet - add one below.</EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {guardians.map((g) => (
            <li key={g.id} className="flex flex-wrap items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-[10rem]">
                <span className="font-medium text-slate-900">{g.name}</span>
                {g.is_primary && (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Primary
                  </span>
                )}
                {g.relationship && <span className="ml-2 text-xs text-slate-600">{g.relationship}</span>}
                <div className="mt-0.5 text-xs text-slate-600">
                  {g.phone || <span className="text-slate-300">no phone</span>}
                  {' · '}
                  {g.email || <span className="text-slate-300">no email</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!g.is_primary && (
                  <form action={makeGuardianPrimaryAction}>
                    <input type="hidden" name="student_id" value={studentId} />
                    <input type="hidden" name="guardian_id" value={g.id} />
                    <SubmitButton className="btn-soft btn-sm" pendingLabel="Saving...">
                      Make primary
                    </SubmitButton>
                  </form>
                )}
                <form action={removeGuardianAction}>
                  <input type="hidden" name="student_id" value={studentId} />
                  <input type="hidden" name="guardian_id" value={g.id} />
                  <ConfirmSubmit
                    className="btn btn-sm btn-danger"
                    title="Remove this guardian?"
                    message={`${g.name}'s contact details are deleted from this student's record.`}
                    confirmLabel="Remove"
                    pendingLabel="Removing..."
                    aria-label={`Remove guardian ${g.name}`}
                  >
                    Remove
                  </ConfirmSubmit>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={addGuardianAction} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <input type="hidden" name="student_id" value={studentId} />
        <Field label="Name">
          <Input name="name" placeholder="Guardian's full name" autoComplete="off" required />
        </Field>
        <Field label="Relationship" hint="Optional">
          <Input name="relationship" placeholder="e.g. Mother" autoComplete="off" />
        </Field>
        <Field label="Phone" hint="Optional">
          <Input name="phone" type="tel" autoComplete="off" />
        </Field>
        <Field label="Email" hint="Optional">
          <Input name="email" type="email" autoComplete="off" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
          <input type="checkbox" name="is_primary" className="h-4 w-4 rounded border-slate-300" />
          Primary contact
        </label>
        <div className="sm:col-span-2">
          <SubmitButton className="btn-primary" pendingLabel="Adding...">
            Add guardian
          </SubmitButton>
        </div>
      </form>
    </Card>
  )
}

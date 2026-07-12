'use client'
import { useFormState } from 'react-dom'
import { addUserAction, type AddUserState } from './actions'
import { Field, Input, Select, SubmitButton } from '../../form'

type Tutor = { id: string; name: string }

const initial: AddUserState = {}

/** Add-user form (client) — surfaces the one-time setup code inline on success,
 *  so the code is never put in a URL. Role options are scoped to the caller. */
export function AddUserForm({ roles, tutors }: { roles: string[]; tutors: Tutor[] }) {
  const [state, formAction] = useFormState(addUserAction, initial)
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <Field label="Email" className="w-full sm:w-48"><Input name="email" type="email" required /></Field>
        <Field label="Name" className="w-full sm:w-40"><Input name="full_name" /></Field>
        <Field label="Role" className="w-full sm:w-32">
          <Select name="role" defaultValue={roles[0]}>
            {roles.map((r) => (<option key={r} value={r}>{r}</option>))}
          </Select>
        </Field>
        <Field label="Class" className="w-full sm:w-28"><Input name="class_level" /></Field>
        <Field label={<>Mentor <span className="text-slate-400">(students)</span></>} className="w-full sm:w-40">
          <Select name="mentor_id" defaultValue="">
            <option value="">None</option>
            {tutors.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </Select>
        </Field>
        <SubmitButton pendingLabel="Adding…">Add user</SubmitButton>
      </form>

      {state.error && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{state.error}</p>
      )}
      {state.ok && state.code && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
          <p className="font-medium">Added {state.email}.</p>
          <p className="mt-1">
            Share this one-time <strong>setup code</strong> so they can create a password at{' '}
            <code className="rounded bg-white px-1 py-0.5">/register</code> — or they can just sign in with Google.
          </p>
          <p className="mt-2 text-center">
            <code className="rounded bg-white px-3 py-1 text-lg font-bold tracking-widest text-emerald-900 ring-1 ring-emerald-200">
              {state.code}
            </code>
          </p>
          <p className="mt-1 text-xs text-emerald-700">Valid 7 days · shown once.</p>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Use the exact email they’ll sign in with. They can sign in with Google, or self-register a password with the setup code.
      </p>
    </div>
  )
}

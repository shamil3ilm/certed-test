'use client'
import { useState } from 'react'
import { useFormState } from 'react-dom'
import { AlertBanner, CARD, cx } from '@/lib/ui'
import { addUserAction, type AddUserState } from './actions'
import { Field, Input, Select, SubmitButton } from '../../form'
import { COMMON_COUNTRIES } from '@/lib/geo/countries'

type MentorCandidate = { id: string; name: string }

const initial: AddUserState = {}

/**
 * Add-user form (client) - surfaces the one-time setup code inline on success, so
 * the code is never put in a URL. Role options are scoped to the caller, and the
 * form is ROLE-AWARE: a student shows class/country/guardian; a tutor or mentor
 * shows contact + joined date. Softer fields (DOB, bio, qualifications) are
 * self-completed by the person at first sign-in, so they are not asked here.
 */
export function AddUserForm({ roles, mentorCandidates }: { roles: string[]; mentorCandidates: MentorCandidate[] }) {
  const [state, formAction] = useFormState(addUserAction, initial)
  const [role, setRole] = useState(roles[0] ?? 'student')
  const isStudent = role === 'student'
  const isTeacher = role === 'tutor' || role === 'mentor'

  return (
    <div className={cx(CARD, 'mt-6 p-4')}>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <Field label="Email" className="w-full sm:w-48">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Name" className="w-full sm:w-40">
          <Input name="full_name" />
        </Field>
        <Field label="Role" className="w-full sm:w-32">
          <Select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>

        {isStudent && (
          <>
            <Field label="Class / grade" className="w-full sm:w-28">
              <Input name="class_level" placeholder="e.g. Grade 10" required />
            </Field>
            <Field label="Country" className="w-full sm:w-40">
              <Input name="country" list="country-list" placeholder="Start typing…" autoComplete="off" required />
            </Field>
            <Field label="Phone" className="w-full sm:w-36">
              <Input name="phone" type="tel" placeholder="Optional" />
            </Field>
            <Field label="Guardian name" className="w-full sm:w-40">
              <Input name="guardian_name" placeholder="Optional" />
            </Field>
            <Field label="Guardian phone" className="w-full sm:w-36">
              <Input name="guardian_phone" type="tel" placeholder="Optional" />
            </Field>
            {mentorCandidates.length > 0 && (
              <Field
                label={
                  <>
                    Mentor <span className="text-slate-400">(students)</span>
                  </>
                }
                className="w-full sm:w-40"
              >
                <Select name="mentor_id" defaultValue="">
                  <option value="">None</option>
                  {mentorCandidates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}

        {isTeacher && (
          <>
            <Field label="Phone" className="w-full sm:w-36">
              <Input name="phone" type="tel" placeholder="Optional" />
            </Field>
            <Field label="Country" className="w-full sm:w-40">
              <Input name="country" list="country-list" placeholder="Optional" autoComplete="off" />
            </Field>
            <Field label="Joined on" className="w-full sm:w-40">
              <Input name="joined_on" type="date" />
            </Field>
          </>
        )}

        <SubmitButton pendingLabel="Adding...">Add user</SubmitButton>
      </form>

      {/* A datalist backs the country field: a search-and-pick dropdown that still
          accepts a free-typed country not on the list. */}
      <datalist id="country-list">
        {COMMON_COUNTRIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {state.error && (
        <AlertBanner tone="warning" className="mt-3">
          {state.error}
        </AlertBanner>
      )}
      {state.ok && state.code && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800"
        >
          <p className="font-medium">Added {state.email}.</p>
          <p className="mt-1">
            Share this one-time <strong>setup code</strong> so they can create a password at{' '}
            <code className="rounded bg-white px-1 py-0.5">/register</code> - or they can just sign in with Google.
          </p>
          <p className="mt-2 text-center">
            <code className="rounded bg-white px-3 py-1 text-lg font-bold tracking-widest text-emerald-900 ring-1 ring-emerald-200">
              {state.code}
            </code>
          </p>
          <p className="mt-1 text-xs text-emerald-700">Valid 7 days - shown once.</p>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Use the exact email they&apos;ll sign in with. They can sign in with Google, or self-register a password with
        the setup code.
      </p>
    </div>
  )
}

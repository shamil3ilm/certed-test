'use client'
import { useActionState } from 'react'
import { AlertBanner, Card } from '@/lib/ui'
import { LocalTime } from '../../../LocalTime'
import { SubmitButton } from '../../../form'
import { reissueCodeAction, type ReissueState } from './actions'

const initial: ReissueState = {}

/**
 * The sign-in invite for an unclaimed account, and the button that replaces its code.
 *
 * Rendered only for an account with no auth identity - see page.tsx. A code is issued, never
 * read back (ADR-0008), so this panel can say whether one is outstanding and when it lapses,
 * and can replace it, but it can never show the current one. The copyable invite is the
 * point: the admin's next action is to send it on, not to memorise it.
 */
export function SetupCodePanel({
  id,
  email,
  fullName,
  expiresAt,
  now,
}: {
  id: string
  email: string
  fullName: string | null
  expiresAt: string | null
  /** Server-computed clock (ms). Passed in - never Date.now() during render - so the
   *  outstanding/lapsed wording is the same on the server and the first client render. */
  now: number
}) {
  // useActionState, not react-dom's useFormState: React 19 renamed the hook, and the old
  // name logs a console error on every render.
  const [state, formAction] = useActionState(reissueCodeAction, initial)

  // A code just issued here is live by definition, and its expiry comes back in the action
  // result - so the wording is right even if the route's own refresh has yet to land.
  const liveUntil = state.expiresAt ?? (expiresAt && new Date(expiresAt).getTime() > now ? expiresAt : null)
  const issued = state.ok && state.code
  const message = issued
    ? `Hello${fullName ? ` ${fullName}` : ''},\n\nYour Cert-Ed Academia account is ready. Go to /register and sign in with:\n\nEmail: ${email}\nSetup code: ${state.code}\n\nThe code is valid for 7 days. You can also sign in with Google using this email.`
    : ''

  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold text-slate-900">Sign-in invite</h2>
      <p className="mt-0.5 text-xs text-slate-600">
        {liveUntil ? (
          <>
            A setup code is outstanding, valid until <LocalTime iso={liveUntil} mode="date" />.
          </>
        ) : (
          'No setup code is outstanding.'
        )}{' '}
        The code itself cannot be shown again - re-issue to replace it.
      </p>

      {state.error && (
        <AlertBanner tone="warning" className="mt-3">
          {state.error}
        </AlertBanner>
      )}

      {issued && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded-lg border border-success-border bg-success-surface px-3 py-3 text-sm text-success-ink"
        >
          <p className="font-medium">New setup code for {state.email}.</p>
          <p className="mt-2 text-center">
            <code className="rounded bg-white px-3 py-1 text-lg font-bold tracking-widest text-success-ink ring-1 ring-success-border">
              {state.code}
            </code>
          </p>
          <p className="mt-1 text-xs text-success-ink">Valid 7 days - shown once. The previous code no longer works.</p>
          <label className="mt-3 block text-xs font-medium text-success-ink" htmlFor="invite-message">
            Copy this and send it to them
          </label>
          <textarea
            id="invite-message"
            readOnly
            rows={8}
            value={message}
            className="mt-1 w-full rounded border border-success-border bg-white p-2 font-mono text-xs text-slate-800"
          />
        </div>
      )}

      <form action={formAction} className="mt-3">
        <input type="hidden" name="id" value={id} />
        <SubmitButton pendingLabel="Issuing...">
          {liveUntil ? 'Re-issue setup code' : 'Issue a setup code'}
        </SubmitButton>
      </form>
    </Card>
  )
}

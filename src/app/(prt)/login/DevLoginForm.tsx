'use client'

import { Field, Input, PasswordInput } from '../form'

export function DevLoginForm({ error }: { error?: boolean }) {
  return (
    <form action="/api/dev/login" method="post" className="space-y-4">
      {error && (
        <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600 border border-red-100">
          Incorrect email or password.
        </p>
      )}

      <Field label="Email address">
        <Input id="dev-email" name="email" type="email" required autoComplete="username" placeholder="name@mock.test" />
      </Field>

      <Field label="Password">
        <PasswordInput
          id="dev-password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="password"
        />
      </Field>

      <button
        type="submit"
        className="btn btn-primary w-full py-2.5 font-semibold shadow-sm transition hover:shadow-md"
      >
        Sign in
      </button>
    </form>
  )
}

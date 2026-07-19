import { describe, it, expect } from 'vitest'
import { bindProfileOnFirstLogin } from '@/lib/auth/binding'

// Minimal chainable fake: builder methods return the builder; maybeSingle()/
// single() pop the next programmed result in call order.
function fakeAdmin(results: Array<{ data: unknown; error?: unknown }>) {
  let i = 0
  const builder: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'ilike', 'is', 'update', 'insert']) {
    builder[m] = () => builder
  }
  builder.maybeSingle = async () => results[i++]
  builder.single = async () => results[i++]
  return builder as never
}

describe('bindProfileOnFirstLogin', () => {
  it('returns the existing profile id when already bound', async () => {
    const admin = fakeAdmin([{ data: { id: 'p1' } }])
    expect(await bindProfileOnFirstLogin('u1', 'a@b.com', admin)).toBe('p1')
  })
  it('returns null when the email is not allowlisted', async () => {
    const admin = fakeAdmin([{ data: null }, { data: null }])
    expect(await bindProfileOnFirstLogin('u1', 'nope@b.com', admin)).toBeNull()
  })
  it('binds an unbound allowlist row and returns its id', async () => {
    const admin = fakeAdmin([
      { data: null },
      { data: { id: 'p2', auth_user_id: null } },
      { data: { id: 'p2' } },
    ])
    expect(await bindProfileOnFirstLogin('u2', 'tutor@b.com', admin)).toBe('p2')
  })
  it('refuses to rebind a row already bound to a different user', async () => {
    const admin = fakeAdmin([
      { data: null },
      { data: { id: 'p3', auth_user_id: 'other' } },
    ])
    expect(await bindProfileOnFirstLogin('u3', 'taken@b.com', admin)).toBeNull()
  })
})

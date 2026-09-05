import { describe, it, expect } from 'vitest'
import { registerSchema, changePasswordSchema, passwordAvoidsEmail } from '@/lib/validation/user'

// Password policy: at least 8 characters with an uppercase
// letter, a lowercase letter, a number, and a special character, and no password
// built from the account's own email name. Breach-corpus checking is delegated
// to Supabase Auth's leaked-password protection.

describe('passwordAvoidsEmail', () => {
  it('rejects a password that contains the email local part (case-insensitive)', () => {
    expect(passwordAvoidsEmail('Aisha-2026!', 'aisha@example.com')).toBe(false)
    expect(passwordAvoidsEmail('xxAISHAxx99', 'aisha@example.com')).toBe(false)
  })

  it('allows an unrelated password', () => {
    expect(passwordAvoidsEmail('Battery-Horse9', 'aisha@example.com')).toBe(true)
  })

  it('skips very short local parts to avoid over-matching', () => {
    expect(passwordAvoidsEmail('ab-Strongpass9', 'ab@example.com')).toBe(true)
  })
})

describe('registerSchema password policy', () => {
  const base = { email: 'aisha@example.com', code: 'SETUP-CODE' }
  const ok = (password: string) => registerSchema.safeParse({ ...base, password }).success

  it('accepts a compliant password (8+, upper, lower, number, special)', () => {
    expect(ok('Strong-1!')).toBe(true)
    expect(ok('Abcd12!x')).toBe(true) // exactly 8
  })

  it('rejects a password under 8 characters', () => {
    expect(ok('Sev7!nx')).toBe(false) // 7 chars, otherwise compliant
  })

  it('requires each character class', () => {
    expect(ok('lowercase-1!')).toBe(false) // no uppercase
    expect(ok('UPPERCASE-1!')).toBe(false) // no lowercase
    expect(ok('NoNumbers!!')).toBe(false) // no digit
    expect(ok('NoSpecial123')).toBe(false) // no special character
  })

  it('rejects a password containing the email name even if otherwise strong', () => {
    expect(ok('Aisha-12345')).toBe(false)
  })
})

describe('changePasswordSchema', () => {
  it('enforces the policy and the confirm match', () => {
    expect(
      changePasswordSchema.safeParse({ password: 'short', confirm: 'short', current_password: 'current-pw' }).success,
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({ password: 'Long-enough-1', confirm: 'nope', current_password: 'current-pw' })
        .success,
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({
        password: 'Long-enough-1',
        confirm: 'Long-enough-1',
        current_password: 'current-pw',
      }).success,
    ).toBe(true)
  })
})

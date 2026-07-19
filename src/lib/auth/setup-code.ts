import 'server-only'
import { randomBytes, createHash } from 'node:crypto'

/**
 * One-time setup codes for password self-registration. An admin issues a code
 * when adding a user; only its SHA-256 hash is stored. The plain code is shown to
 * the admin once and shared out-of-band, then consumed at /register.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous I/O/0/1
const CODE_LENGTH = 8
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/** A fresh, human-friendly setup code (unambiguous uppercase chars). */
export function generateSetupCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

/** SHA-256 hex of the normalized code — what we store. */
export function hashSetupCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
}

/** ISO expiry timestamp for a freshly-issued code. */
export function setupCodeExpiry(): string {
  return new Date(Date.now() + TTL_MS).toISOString()
}

/** True if the entered code matches the stored hash and hasn't expired. */
export function setupCodeValid(
  code: string,
  hash: string | null | undefined,
  expiresAt: string | null | undefined,
): boolean {
  if (!hash || !expiresAt) return false
  if (new Date(expiresAt).getTime() < Date.now()) return false
  return hashSetupCode(code) === hash
}

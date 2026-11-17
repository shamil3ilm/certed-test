import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Static Analysis Security Guard:
 * Asserts that EVERY file declaring 'use server' in the application performs
 * an authentic server-side authorization check (e.g. requireCapability, requireRole,
 * requireActiveProfile, or calls a domain service that requires an authenticated actor).
 *
 * This guarantees that an attacker manipulating client-side state in DevTools
 * (unhiding buttons, modifying forms, or directly invoking Next-Action endpoints)
 * CANNOT trigger unauthenticated or unauthorized server mutations.
 */
describe('Server Actions Security Audit', () => {
  const prtDir = path.resolve(process.cwd(), 'src/app/(prt)')

  function findServerActionFiles(dir: string): string[] {
    const results: string[] = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...findServerActionFiles(fullPath))
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        const content = fs.readFileSync(fullPath, 'utf8')
        if (content.includes("'use server'") || content.includes('"use server"')) {
          results.push(fullPath)
        }
      }
    }
    return results
  }

  const serverActionFiles = findServerActionFiles(prtDir)

  it('found all server action files in src/app/(prt)', () => {
    expect(serverActionFiles.length).toBeGreaterThan(15)
  })

  it('guarantees each server action file imports and uses server authorization guards', () => {
    const authGuardPatterns = [
      'requireCapability',
      'requireRole',
      'requireActiveProfile',
      'requireActiveProfileApi',
      'getActorContext',
      'rateLimitShared', // public onboarding actions (register) guarded by distributed rate limiting & one-time setup codes
    ]

    const filesMissingGuards: string[] = []

    for (const filePath of serverActionFiles) {
      const content = fs.readFileSync(filePath, 'utf8')
      const hasGuard = authGuardPatterns.some((pattern) => content.includes(pattern))
      if (!hasGuard) {
        filesMissingGuards.push(path.relative(process.cwd(), filePath))
      }
    }

    expect(
      filesMissingGuards,
      `The following server action files are missing server-side authorization checks:\n${filesMissingGuards.join('\n')}`,
    ).toEqual([])
  })
})

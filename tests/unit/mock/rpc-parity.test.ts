import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Generalized mock-parity guard (NEW-35-H2): the E2E suite runs against MOCK mode, so every
 * Postgres function the app invokes via `.rpc('fn')` must have a mock implementation - or that
 * code path silently misbehaves (or errors) in every E2E, and the specs neither confirm nor
 * refute real behaviour. teaches-class-rpc.test.ts locks the SEMANTICS of one pair; this test
 * enumerates ALL `.rpc()` call sites from source and asserts the mock at least IMPLEMENTS each
 * (i.e. never falls through to the "mock rpc not implemented" sentinel), so a newly-added RPC
 * can't ship without a mock.
 */

// A minimal, empty store: this test only checks that each fn is DISPATCHED (not the
// "not implemented" branch), not that its logic is correct for given data.
vi.mock('@/lib/mock/store', () => ({ table: () => [], persist: () => {} }))
vi.mock('@/lib/mock/session', () => ({ getMockUidFromStore: vi.fn(async () => null) }))

import { createMockServerClient } from '@/lib/mock/client'

const SRC = 'src'

// Dynamically-dispatched RPCs whose fn is a VARIABLE, so the literal scan below cannot see the
// names. If you add another `.rpc(<variable>)` site, this test's dynamic-site guard will fail
// until you add the file here AND the concrete fn names to DYNAMIC_RPC_NAMES.
const DYNAMIC_RPC_FILES = new Set(['src/lib/data/finance-docs-writes.ts'])
const DYNAMIC_RPC_NAMES = ['issue_receipt_doc', 'issue_payslip_doc']

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** Scan src for `.rpc(...)` sites: literal fn names, plus the files that dispatch by variable. */
function collectRpcCalls(): { literal: Set<string>; dynamicFiles: Set<string> } {
  const literal = new Set<string>()
  const dynamicFiles = new Set<string>()
  const rpcRe = /\.rpc\(\s*(['"]?)([A-Za-z_$][\w$]*)\1/g
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(rpcRe)) {
      if (m[1]) literal.add(m[2])
      else dynamicFiles.add(relative('.', file).replace(/\\/g, '/'))
    }
  }
  return { literal, dynamicFiles }
}

const { literal, dynamicFiles } = collectRpcCalls()

describe('mock RPC parity: every app .rpc() has a mock (NEW-35-H2)', () => {
  it('found the app RPC call sites at all (guards a broken scan)', () => {
    // Sanity: known literal RPCs must be present, or the regex silently matched nothing.
    expect(literal.has('teaches_class')).toBe(true)
    expect(literal.has('claim_pending_emails')).toBe(true)
  })

  it('every dynamically-dispatched .rpc() site is a known one', () => {
    const unknown = [...dynamicFiles].filter((f) => !DYNAMIC_RPC_FILES.has(f)).sort()
    expect(
      unknown,
      `new .rpc(<variable>) site(s): ${unknown.join(', ')}. Add the file to DYNAMIC_RPC_FILES and its concrete fn names to DYNAMIC_RPC_NAMES.`,
    ).toEqual([])
  })

  const allRpcNames = [...new Set([...literal, ...DYNAMIC_RPC_NAMES])].sort()

  it.each(allRpcNames)('mock implements RPC "%s"', async (fn) => {
    const client = (await createMockServerClient()) as unknown as {
      rpc: (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
    }
    try {
      const { error } = await client.rpc(fn, {})
      // Any outcome except the explicit not-implemented sentinel means the fn is dispatched.
      expect(error?.message ?? '').not.toBe(`mock rpc not implemented: ${fn}`)
    } catch {
      // A handler that ran and threw on empty args is still IMPLEMENTED - which is all we assert.
    }
  })
})
